type Entry<T> = { value: T; expiresAt: number };
const mem = new Map<string, Entry<any>>();

export function cacheGet<T>(key: string): T | undefined {
  const e = mem.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { mem.delete(key); return undefined; }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = 1000 * 60 * 60 * 12) {
  mem.set(key, { value, expiresAt: Date.now() + ttlMs });
}
