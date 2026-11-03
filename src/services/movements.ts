import { api } from "./api";
import type { Location, MovementItem, MoveType, MovementSummary } from "../types";

const TYPE_TO_BACKEND: Record<MoveType, "inbound" | "outbound" | "transfer"> = {
  entry: "inbound",
  exit: "outbound",
  transfer: "transfer",
};

const TYPE_FROM_BACKEND: Record<"inbound" | "outbound" | "transfer", MoveType> = {
  inbound: "entry",
  outbound: "exit",
  transfer: "transfer",
};

export interface CreateMovementParams {
  warehouseId: string;
  type: MoveType;
  reference?: string;
  origin?: Location;
  destination?: Location;
  items: MovementItem[];
}

/** Exactly what POST /movements receives — also what the offline queue persists. */
export interface MovementPayload {
  clientId: string;
  capturedAt: string;
  warehouseId: string;
  type: "inbound" | "outbound" | "transfer";
  reference?: string;
  lines: Record<string, unknown>[];
}

interface ApiMovement {
  _id: string;
  folio?: string;
  type: "inbound" | "outbound" | "transfer";
  status: "draft" | "local_pending" | "syncing" | "completed" | "failed";
}

export function buildMovementPayload(params: CreateMovementParams, clientId: string, capturedAt = new Date()): MovementPayload {
  const lines: Record<string, unknown>[] = [];
  for (const item of params.items) {
    const base = {
      productId: item.product.id,
      sourceLocationId: params.origin?.id,
      destinationLocationId: params.destination?.id,
      lot: item.lot,
    };
    if (item.product.serialized && item.serials.length > 0) {
      for (const serial of item.serials) lines.push({ ...base, quantity: 1, serial });
    } else {
      lines.push({ ...base, quantity: item.quantity });
    }
  }

  return {
    clientId,
    capturedAt: capturedAt.toISOString(),
    warehouseId: params.warehouseId,
    type: TYPE_TO_BACKEND[params.type],
    reference: params.reference,
    lines,
  };
}

/** Idempotent on `payload.clientId`: resending an already-applied movement returns the original folio. */
export async function postMovement(token: string, payload: MovementPayload): Promise<{ folio: string; replayed: boolean }> {
  const { movement, replayed } = await api.post<{ movement: ApiMovement; replayed?: boolean }>("/movements", payload, token);
  return { folio: movement.folio ?? "", replayed: !!replayed };
}

interface ApiUser { name: string }
interface ApiLocationRef { zone: string; aisle: string; rack: string; position: string }
interface ApiMovementLine { sourceLocationId?: ApiLocationRef | string; destinationLocationId?: ApiLocationRef | string }
interface ApiMovementListItem extends ApiMovement {
  createdAt: string;
  userId: ApiUser | string;
  reference?: string;
  lines: ApiMovementLine[];
}

function mapLocationRef(ref?: ApiLocationRef | string): Location | undefined {
  if (!ref || typeof ref === "string") return undefined;
  return { zone: ref.zone, aisle: ref.aisle, rack: ref.rack, position: ref.position };
}

function mapMovement(m: ApiMovementListItem): MovementSummary {
  const firstLine = m.lines[0];
  return {
    id: m._id,
    folio: m.folio,
    createdAt: m.createdAt,
    type: TYPE_FROM_BACKEND[m.type],
    status: m.status,
    date: new Date(m.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    user: typeof m.userId === "string" ? "—" : m.userId.name,
    origin: mapLocationRef(firstLine?.sourceLocationId),
    destination: mapLocationRef(firstLine?.destinationLocationId),
    reference: m.reference,
    itemCount: m.lines.length,
  };
}

export async function fetchMovements(token: string, warehouseId?: string): Promise<MovementSummary[]> {
  const query = warehouseId ? `?warehouseId=${warehouseId}` : "";
  const { movements } = await api.get<{ movements: ApiMovementListItem[] }>(`/movements${query}`, token);
  return movements.map(mapMovement);
}
