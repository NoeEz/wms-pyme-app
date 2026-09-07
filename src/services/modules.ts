import { api } from "./api";
import type { ModuleInfo } from "../types";

export async function fetchModules(token: string): Promise<ModuleInfo[]> {
  const { modules } = await api.get<{ modules: ModuleInfo[] }>("/modules", token);
  return modules;
}

export async function updateModules(token: string, enabledModules: string[]): Promise<ModuleInfo[]> {
  const { modules } = await api.patch<{ modules: ModuleInfo[] }>("/modules", { enabledModules }, token);
  return modules;
}

/** Default-open (true) while modules haven't loaded yet, so nothing flashes disabled on first render. */
export function isModuleEnabled(modules: ModuleInfo[], key: string): boolean {
  const found = modules.find(m => m.key === key);
  return found ? found.enabled : true;
}
