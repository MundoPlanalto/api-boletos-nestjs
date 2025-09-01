export async function withLimit<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  let i = 0, active = 0;

  return new Promise((resolve, reject) => {
    const next = () => {
      if (i === tasks.length && active === 0) return resolve(results);
      while (active < limit && i < tasks.length) {
        const idx = i++;
        active++;
        tasks[idx]().then((r) => {
          results[idx] = r;
          active--;
          next();
        }).catch(reject);
      }
    };
    next();
  });
}
