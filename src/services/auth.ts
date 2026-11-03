import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";
import { readJSON, writeJSON, removeKey } from "./storage";
import type { Role, User, Warehouse } from "../types";

const TOKEN_KEY = "wms_pyme_token";
// Non-secret session context, kept so the app reopens where the operator left
// off — even offline, which is when restarting the app is most likely.
const SESSION_KEY = "wms_pyme_session_v1";
// Last company code typed at login — kept across logouts so operators don't
// retype it on a shared device.
const LAST_COMPANY_KEY = "wms_pyme_last_company";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role | "client";
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  company: { id: string; name: string; slug: string };
}

export interface StoredSession {
  token: string;
  user: User;
  warehouse?: Warehouse;
}

export async function login(company: string, email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await api.post<LoginResult>("/auth/login", { company, email, password });
  // 3PL client users ("client") only have the web portal; the app operates the warehouse.
  if (result.user.role === "client") {
    throw new ApiError(403, "forbidden", "Tu cuenta es de cliente: consulta tu inventario en el portal web.");
  }
  const user: User = { ...result.user, role: result.user.role, companyName: result.company.name };
  await SecureStore.setItemAsync(TOKEN_KEY, result.token);
  await writeJSON(SESSION_KEY, { user });
  await writeJSON(LAST_COMPANY_KEY, result.company.slug);
  return { token: result.token, user };
}

export async function getLastCompany(): Promise<string> {
  return readJSON<string>(LAST_COMPANY_KEY, "");
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
