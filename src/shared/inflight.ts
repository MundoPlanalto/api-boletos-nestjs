// evita refazer a mesma chamada (bill,inst) enquanto a 1ª ainda está em andamento
const inflight = new Map<string, Promise<any>>();

export async function dedupePromise<T>(key: string, factory: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = factory().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
