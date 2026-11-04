import { Platform } from "react-native";
import { readJSON, writeJSON, removeKeysWithPrefix } from "./storage";

// Base URL of the real WMS-PyME backend (backend/). Configure it per machine
// with EXPO_PUBLIC_API_URL, pointing at your computer's LAN IP so a phone on
// Expo Go can reach it — e.g. EXPO_PUBLIC_API_URL=http://192.168.1.50:4000/api.
// Without it, the web build (Expo web in a browser) talks to the API on the
// same machine that serves the page.
const WEB_DEFAULT = Platform.OS === "web" && typeof window !== "undefined"
  ? `http://${window.location.hostname}:4000/api`
  : undefined;
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? WEB_DEFAULT ?? "http://10.8.4.247:4000/api";

/** Unauthenticated liveness endpoint (served outside /api) — used to tell "no signal" from "server unreachable". */
export const HEALTH_URL = `${BASE_URL.replace(/\/api\/?$/, "")}/health`;

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** True for failures worth retrying later as-is (no signal, timeout, server down/overloaded). */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 429 || err.status >= 500;
}

// Called when an authenticated request comes back 401 (expired/invalid
// token), so App can drop the session and send the user back to login.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, options: RequestInit, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "No se pudo conectar con el servidor. Verifica tu conexión y la dirección del backend.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.();
    throw new ApiError(res.status, data.error ?? "unknown_error", data.message ?? "Ocurrió un error inesperado.");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),
};

// Offline read cache: catalog-type GETs (products, locations, warehouses)
// are saved on every successful response and served from the device when
// the server can't be reached, so operators can keep scanning offline.
const CACHE_PREFIX = "wms_pyme_cache_v1:";

export async function cachedGet<T>(path: string, token: string): Promise<T> {
  try {
    const data = await api.get<T>(path, token);
    writeJSON(CACHE_PREFIX + path, data).catch(() => {});
    return data;
  } catch (err) {
    if (!isTransientError(err)) throw err;
    const cached = await readJSON<T | null>(CACHE_PREFIX + path, null);
    if (cached) return cached;
    throw err;
  }
}

/** Drops cached catalog data — on logout, so another account on this device never sees it. */
export async function clearCache(): Promise<void> {
  await removeKeysWithPrefix(CACHE_PREFIX);
}
