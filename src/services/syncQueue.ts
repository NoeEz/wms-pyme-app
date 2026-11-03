import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { ApiError, isTransientError } from "./api";
import { postMovement, type MovementPayload } from "./movements";
import { readJSON, writeJSON } from "./storage";
import type { MoveType } from "../types";

// Offline queue for movements (Fase 2). Every movement that can't be
// confirmed against the server right away is persisted here and replayed
// later. Replays are safe because the backend is idempotent on
// `payload.clientId` — a movement whose response got lost is never applied twice.
//
// Status lifecycle:
//   pending ──sync──▶ syncing ──ok──▶ synced (kept 24 h for reference, then pruned)
//                        │
//                        ├─ transient (no signal / 5xx / 401) ──▶ pending (retried automatically)
//                        └─ rejected by business rules (422/403…) ──▶ error (operator retries or discards)

export type QueueStatus = "pending" | "syncing" | "error" | "synced";

export interface QueuedMovement {
  id: string; // same as payload.clientId
  userId: string;
  moveType: MoveType;
  warehouseName: string;
  reference?: string;
  units: number;
  createdAt: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  folio?: string;
  syncedAt?: string;
  payload: MovementPayload;
}

const KEY = "wms_pyme_sync_queue_v1";
const SYNCED_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SYNC_INTERVAL_MS = 30_000;

let entries: QueuedMovement[] = [];
let loaded = false;
let syncing = false;
const listeners = new Set<() => void>();

function commit(next: QueuedMovement[]) {
  entries = next;
  listeners.forEach(l => l());
  writeJSON(KEY, entries).catch(() => {});
}

function patch(id: string, changes: Partial<QueuedMovement>) {
  commit(entries.map(e => (e.id === id ? { ...e, ...changes } : e)));
}

export async function loadQueue(): Promise<void> {
  if (loaded) return;
  const stored = await readJSON<QueuedMovement[]>(KEY, []);
  const now = Date.now();
  loaded = true;
  commit(
    stored
      // An app kill mid-request leaves entries "syncing"; they're safe to resend.
      .map(e => (e.status === "syncing" ? { ...e, status: "pending" as const } : e))
      .filter(e => e.status !== "synced" || now - Date.parse(e.syncedAt ?? e.createdAt) < SYNCED_TTL_MS),
  );
}

export function enqueue(entry: Omit<QueuedMovement, "id" | "status" | "attempts" | "createdAt">): QueuedMovement {
  const queued: QueuedMovement = {
    ...entry,
    id: entry.payload.clientId,
    status: "pending",
    attempts: 0,
    createdAt: entry.payload.capturedAt,
  };
  commit([...entries.filter(e => e.id !== queued.id), queued]);
  return queued;
}

export function discard(id: string): void {
  commit(entries.filter(e => e.id !== id));
}

/** Sends one entry. Returns false when the server is unreachable, so callers stop hammering it. */
async function syncOne(token: string, entry: QueuedMovement): Promise<boolean> {
  patch(entry.id, { status: "syncing", attempts: entry.attempts + 1 });
  try {
    const { folio } = await postMovement(token, entry.payload);
    patch(entry.id, { status: "synced", folio, syncedAt: new Date().toISOString(), lastError: undefined });
    return true;
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Error desconocido al sincronizar.";
    if (isTransientError(err) || (err instanceof ApiError && err.status === 401)) {
      patch(entry.id, { status: "pending", lastError: message });
      return false;
    }
    patch(entry.id, { status: "error", lastError: message });
    return true;
  }
}

/** Replays this user's pending movements in capture order (an entry may rely on stock from an earlier one). */
export async function syncAll(token: string, userId: string): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const queue = entries
      .filter(e => e.userId === userId && e.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const entry of queue) {
      if (!(await syncOne(token, entry))) break;
    }
  } finally {
    syncing = false;
  }
}

export async function retry(token: string, id: string): Promise<void> {
  const entry = entries.find(e => e.id === id);
  if (entry && entry.status !== "syncing" && entry.status !== "synced") await syncOne(token, entry);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useSyncQueue(userId?: string): QueuedMovement[] {
  const all = useSyncExternalStore(subscribe, () => entries);
  return userId ? all.filter(e => e.userId === userId) : all;
}

export function useQueuedMovement(id?: string): QueuedMovement | undefined {
  return useSyncExternalStore(subscribe, () => entries.find(e => e.id === id));
}

export function countUnsynced(list: QueuedMovement[]): number {
  return list.filter(e => e.status !== "synced").length;
}

/**
 * Keeps the queue draining in the background: on reconnect, when the app
 * returns to the foreground, and every 30 s while something is pending.
 */
export function useAutoSync(token: string | null, userId: string | undefined, reachable: boolean | null): void {
  const hasPending = useSyncQueue(userId).some(e => e.status === "pending");

  useEffect(() => {
    if (!token || !userId || reachable === false) return;
    const run = () => { syncAll(token, userId).catch(() => {}); };
    run();
    if (!hasPending) return;

    const interval = setInterval(run, AUTO_SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener("change", state => { if (state === "active") run(); });
    return () => { clearInterval(interval); sub.remove(); };
  }, [token, userId, reachable, hasPending]);
}
