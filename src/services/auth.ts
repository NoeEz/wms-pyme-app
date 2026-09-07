import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import type { Role } from "../types";

const TOKEN_KEY = "wms_pyme_token";

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

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await api.post<LoginResult>("/auth/login", { email, password });
  await SecureStore.setItemAsync(TOKEN_KEY, result.token);
  return result;
}

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
