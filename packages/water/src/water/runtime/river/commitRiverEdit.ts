import type { RiverEditPublication } from "./RiverEditSession";

/** All participants are already prepared. The reversible terrain swap and Water's
 * rollback-capable commit run in one synchronous turn, before another frame/query turn. */
export function commitRiverEdit<T>(
  edit: RiverEditPublication | undefined,
  water: { commit(): T },
  terrain: { commit(): void; rollback(): void }
): T {
  edit?.assertCurrent();
  let result: T;
  try {
    terrain.commit();
    edit?.assertCurrent();
    result = water.commit();
  } catch (error) {
    terrain.rollback();
    throw error;
  }
  edit?.commit();
  return result;
}
