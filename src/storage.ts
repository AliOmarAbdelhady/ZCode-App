import * as SecureStore from 'expo-secure-store';

export type Session = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  lastUsedAt?: number;
};

const KEY = 'zcode.sessions';
const BIOMETRIC_KEY = 'zcode.biometricLock';
const UNLOCKED_KEY = 'zcode.unlockedUntil';
// One unlock keeps the app open for 24 hours; after that it re-locks.
export const UNLOCK_SESSION_MS = 24 * 60 * 60 * 1000;

function parseUrl(raw: string): Session | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u = trimmed;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes('zcode') && !parsed.hostname.includes('z.ai')) {
      // still allow, but only warn visually elsewhere
    }
    return {
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name: parsed.hostname,
      url: u,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function loadSessions(): Promise<Session[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Session[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveSessions(list: Session[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(list));
}

export async function addSession(rawUrl: string): Promise<Session | null> {
  const s = parseUrl(rawUrl);
  if (!s) return null;
  const list = await loadSessions();
  list.unshift(s);
  await saveSessions(list);
  return s;
}

export async function removeSession(id: string) {
  const list = await loadSessions();
  await saveSessions(list.filter((s) => s.id !== id));
}

export async function touchSession(id: string) {
  const list = await loadSessions();
  const s = list.find((x) => x.id === id);
  if (s) {
    s.lastUsedAt = Date.now();
    await saveSessions(list);
  }
}

export async function getBiometricLock(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
}

export async function setBiometricLock(on: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, on ? '1' : '0');
}

export async function getUnlockedUntil(): Promise<number> {
  const raw = await SecureStore.getItemAsync(UNLOCKED_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setUnlockedUntil(ms: number) {
  await SecureStore.setItemAsync(UNLOCKED_KEY, String(ms));
}
