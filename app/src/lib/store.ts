import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Small key-value store: the browser's localStorage on web, AsyncStorage on phones.
// Failures are ignored (private windows can block storage); callers must cope with null.
export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) ?? null : await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, raw);
    else await AsyncStorage.setItem(key, raw);
  } catch { /* storage full or blocked */ }
}

export function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
