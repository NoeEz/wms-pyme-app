import { api } from "./api";
import type { ModuleInfo, User } from "../types";

export async function fetchModules(token: string): Promise<ModuleInfo[]> {
  const { modules } = await api.get<{ modules: ModuleInfo[] }>("/modules", token);
  return modules;
}

export async function updateModules(token: string, enabledModules: string[]): Promise<ModuleInfo[]> {
  const { modules } = await api.patch<{ modules: ModuleInfo[] }>("/modules", { enabledModules }, token);
  return modules;
}

/**
 * Whether the user holds a permission. Sessions saved by older app versions
 * have no permission list: default-open, the server still enforces it.
 */
export function can(user: User | null | undefined, permission: string): boolean {
  return !user?.permissions || user.permissions.includes(permission);
}

// Permission that "using" each module needs (Tesina §4.5.10). The admin
// controls both sides: whether the module is on for the company, and who
// holds the permission.
const MODULE_PERMISSION: Record<string, string> = {
  inbound: "inbound.create",
  outbound: "outbound.create",
  transfer: "transfer.create",
  camera_scan: "capture.camera",
  inventory: "inventory.view",
  history: "history.view",
};

/**
 * What this user can actually use: a module counts as enabled only if the
 * company has it on AND the user holds its permission. Screens keep asking
 * `isModuleEnabled` and automatically hide what the user can't do.
 */
export function usableModules(modules: ModuleInfo[], user: User | null | undefined): ModuleInfo[] {
  return modules.map(m => {
    const permission = MODULE_PERMISSION[m.key];
    return permission && !can(user, permission) ? { ...m, enabled: false } : m;
  });
}

export function moduleSetting(modules: ModuleInfo[], key: string, setting: string): boolean | number | undefined {
  return modules.find(m => m.key === key)?.settings?.[setting];
}

/** Default-open (true) while modules haven't loaded yet, so nothing flashes disabled on first render. */
export function isModuleEnabled(modules: ModuleInfo[], key: string): boolean {
  const found = modules.find(m => m.key === key);
  return found ? found.enabled : true;
}
