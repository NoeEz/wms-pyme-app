import AsyncStorage from "@react-native-async-storage/async-storage";

// Thin JSON wrapper over AsyncStorage for non-secret, device-local state
// (offline queue, preferences, last session context). Secrets — the JWT —
// stay in expo-secure-store (see services/auth.ts).

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function removeKeysWithPrefix(prefix: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(prefix)));
}
