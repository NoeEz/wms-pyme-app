import { useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";

export interface ScanPreferences {
  sound: boolean;
  vibration: boolean;
  /** Hide the on-screen keyboard on the scan field — for devices with a built-in/handheld reader. */
  hardwareScanner: boolean;
}

const KEY = "wms_pyme_prefs_v1";
const DEFAULTS: ScanPreferences = { sound: true, vibration: true, hardwareScanner: false };

let current: ScanPreferences = DEFAULTS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export async function loadPreferences(): Promise<void> {
  current = { ...DEFAULTS, ...(await readJSON<Partial<ScanPreferences>>(KEY, {})) };
  emit();
}

export function getPreferences(): ScanPreferences {
  return current;
}

export function setPreference<K extends keyof ScanPreferences>(key: K, value: ScanPreferences[K]): void {
  current = { ...current, [key]: value };
  emit();
  writeJSON(KEY, current).catch(() => {});
}

export function usePreferences(): ScanPreferences {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}
