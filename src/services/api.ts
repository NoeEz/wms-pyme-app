// Base URL of the real WMS-PyME backend (backend/). Configure it per machine
// with EXPO_PUBLIC_API_URL, pointing at your computer's LAN IP so a phone on
// Expo Go can reach it — e.g. EXPO_PUBLIC_API_URL=http://192.168.1.50:4000/api.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "No se pudo conectar con el servidor. Verifica tu conexión y la dirección del backend.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "unknown_error", data.message ?? "Ocurrió un error inesperado.");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),
};
