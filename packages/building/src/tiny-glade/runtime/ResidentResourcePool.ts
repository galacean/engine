import type { Engine } from "@galacean/engine";
interface Resource {
  destroy(): void;
}
interface Entry {
  refs: number;
  value: Promise<Resource>;
}
const pools = new WeakMap<Engine, Map<string, Entry>>();
/** Immutable hash-addressed resources only. Each scene owns a lease, never a borrowed destroy. */
export function leaseResidentResource<T extends Resource>(engine: Engine, key: string, create: () => Promise<T>) {
  let pool = pools.get(engine);
  if (!pool) {
    pool = new Map();
    pools.set(engine, pool);
  }
  let entry = pool.get(key);
  if (!entry) {
    entry = { refs: 0, value: create() };
    pool.set(key, entry);
    const own = entry;
    void entry.value.catch(() => {
      if (pool!.get(key) === own) pool!.delete(key);
    });
  }
  entry.refs++;
  let released = false;
  return {
    value: entry.value as Promise<T>,
    destroy() {
      if (released) return;
      released = true;
      if (--entry!.refs === 0) {
        if (pool!.get(key) === entry) pool!.delete(key);
        void entry!.value.then(
          (r) => r.destroy(),
          () => {}
        );
      }
    }
  };
}
