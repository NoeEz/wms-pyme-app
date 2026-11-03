import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";
import { readJSON, writeJSON, removeKey } from "./storage";
import type { Role, User, Warehouse } from "../types";

const TOKEN_KEY = "wms_pyme_token";
// Non-secret session context, kept so the app reopens where the operator left
// off — even offline, which is when restarting the app is most likely.
const SESSION_KEY = "wms_pyme_session_v1";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export interface StoredSession {
  token: string;
  user: User;
  warehouse?: Warehouse;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await api.post<LoginResult>("/auth/login", { email, password });
  await SecureStore.setItemAsync(TOKEN_KEY, result.token);
  await writeJSON(SESSION_KEY, { user: result.user });
  return result;
}

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function rememberWarehouse(warehouse: Warehouse): Promise<void> {
  const session = await readJSON<{ user?: User; warehouse?: Warehouse }>(SESSION_KEY, {});
  await writeJSON(SESSION_KEY, { ...session, warehouse });
}

/**
 * Restores the previous session on app launch. The token is checked against
 * the backend when reachable; if the server can't be reached the stored
 * session is trusted, so operators can keep capturing movements offline.
 */
export async function restoreSession(): Promise<StoredSession | null> {
  const token = await getStoredToken();
  const { user, warehouse } = await readJSON<{ user?: User; warehouse?: Warehouse }>(SESSION_KEY, {});
  if (!token || !user) return null;

  try {
    await api.get("/auth/me", token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await clearStoredToken();
      return null;
    }
  }
  return { token, user, warehouse };
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await removeKey(SESSION_KEY);
}
