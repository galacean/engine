import type { Engine } from "@galacean/engine";
interface Resource {
  destroy(): void;
}
interface LeaseOwner {
  onOwnershipChange?: (owned: boolean) => void;
}
interface Entry {
  refs: number;
  resolved: boolean;
  owner: LeaseOwner | null;
  leases: Set<LeaseOwner>;
  value: Promise<Resource>;
}
const pools = new WeakMap<Engine, Map<string, Entry>>();
/** Immutable hash-addressed resources only. Each scene owns a lease, never a borrowed destroy. */
export function leaseResidentResource<T extends Resource>(
  engine: Engine,
  key: string,
  create: () => Promise<T>,
  onOwnershipChange?: (owned: boolean) => void
) {
  let pool = pools.get(engine);
  if (!pool) {
    pool = new Map();
    pools.set(engine, pool);
  }
  const leaseOwner: LeaseOwner = { onOwnershipChange };
  let entry = pool.get(key);
  if (!entry) {
    const created: Entry = {
      refs: 1,
      resolved: false,
      owner: leaseOwner,
      leases: new Set([leaseOwner]),
      value: create()
    };
    entry = created;
    pool.set(key, entry);
    void entry.value.then(
      () => {
        if (created.leases.size === 0) return;
        created.resolved = true;
        created.owner?.onOwnershipChange?.(true);
      },
      () => {
        if (pool!.get(key) === created) pool!.delete(key);
      }
    );
  } else {
    entry.refs++;
    entry.leases.add(leaseOwner);
  }
  let released = false;
  return {
    value: entry.value as Promise<T>,
    destroy() {
      if (released) return;
      released = true;
      entry!.leases.delete(leaseOwner);
      if (--entry!.refs === 0) {
        if (entry!.owner === leaseOwner && entry!.resolved) {
          entry!.owner = null;
          leaseOwner.onOwnershipChange?.(false);
        } else {
          entry!.owner = null;
        }
        if (pool!.get(key) === entry) pool!.delete(key);
        void entry!.value.then(
          (r) => r.destroy(),
          () => {}
        );
      } else if (entry!.owner === leaseOwner) {
        const next = entry!.leases.values().next().value ?? null;
        entry!.owner = next;
        if (entry!.resolved) {
          leaseOwner.onOwnershipChange?.(false);
          next?.onOwnershipChange?.(true);
        }
      }
    }
  };
}
