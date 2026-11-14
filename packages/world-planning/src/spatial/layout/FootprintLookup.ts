import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { bounds, type Bounds } from "./Volumes";

/** Broad phase only: callers retain their exact polygon/distance tests. */
export function footprintLookup<T>(items: readonly T[], outline: (item: T) => PlanPoint[], cellM = 32) {
  const lookup = footprintBoundsLookup(items, outline, cellM);
  return (point: PlanPoint, radius = 0): T[] =>
    lookup({
      x0: point.x - radius,
      x1: point.x + radius,
      z0: point.z - radius,
      z1: point.z + radius
    });
}

/** Candidate footprints for a world-space rectangle, including spans whose endpoints lie outside it.
 * This is a broad phase only; callers must retain their exact polygon/segment checks.
 */
export function footprintBoundsLookup<T>(items: readonly T[], outline: (item: T) => PlanPoint[], cellM = 32) {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const points = outline(item);
    if (!points.length) continue;
    const b = bounds(points);
    for (let x = Math.floor(b.x0 / cellM); x <= Math.floor(b.x1 / cellM); x++)
      for (let z = Math.floor(b.z0 / cellM); z <= Math.floor(b.z1 / cellM); z++) {
        const key = x + ":" + z;
        let cell = cells.get(key);
        if (!cell) cells.set(key, (cell = []));
        cell.push(item);
      }
  }
  return (box: Bounds): T[] => {
    const found = new Set<T>();
    for (let x = Math.floor(box.x0 / cellM); x <= Math.floor(box.x1 / cellM); x++)
      for (let z = Math.floor(box.z0 / cellM); z <= Math.floor(box.z1 / cellM); z++)
        for (const item of cells.get(x + ":" + z) ?? []) found.add(item);
    return [...found];
  };
}

/** Mutable broad-phase footprints owned by one solve. Callers retain exact geometry predicates. */
export class FootprintBoundsIndex<T> {
  private readonly cells = new Map<string, Set<T>>();
  private readonly footprints = new Map<T, Bounds>();

  /** Index the initial footprints.
   * @param items Objects with stable identity during this solve.
   * @param outline Current world-space footprint of an object.
   * @param cellM Positive finite cell width in metres.
   * @throws If the cell width is not positive and finite.
   */
  constructor(
    items: readonly T[],
    private readonly outline: (item: T) => PlanPoint[],
    private readonly cellM = 32
  ) {
    if (!Number.isFinite(cellM) || cellM <= 0) throw new Error("Invalid footprint index cell width");
    for (const item of items) this.add(item);
  }

  /** Add an object, or refresh its footprint after a geometry change.
   * @param item Object whose current footprint should be indexed; an empty footprint removes it.
   */
  add(item: T): void {
    this.remove(item);
    const points = this.outline(item);
    if (!points.length) return;
    const box = bounds(points);
    this.footprints.set(item, box);
    for (let x = Math.floor(box.x0 / this.cellM); x <= Math.floor(box.x1 / this.cellM); x++)
      for (let z = Math.floor(box.z0 / this.cellM); z <= Math.floor(box.z1 / this.cellM); z++) {
        const key = x + ":" + z;
        let cell = this.cells.get(key);
        if (!cell) this.cells.set(key, (cell = new Set()));
        cell.add(item);
      }
  }

  /** Remove a previously indexed object.
   * @param item Object identity to remove; absent objects are ignored.
   */
  remove(item: T): void {
    const box = this.footprints.get(item);
    if (!box) return;
    for (let x = Math.floor(box.x0 / this.cellM); x <= Math.floor(box.x1 / this.cellM); x++)
      for (let z = Math.floor(box.z0 / this.cellM); z <= Math.floor(box.z1 / this.cellM); z++) {
        const key = x + ":" + z,
          cell = this.cells.get(key)!;
        cell.delete(item);
        if (!cell.size) this.cells.delete(key);
      }
    this.footprints.delete(item);
  }

  /** Find broad-phase candidates in a world-space rectangle.
   * @param box Query rectangle, expanded by the caller's clearance or tolerance when needed.
   * @returns Each nearby object once; ordering is unspecified and exact geometry checks remain required.
   */
  query(box: Bounds): T[] {
    const found = new Set<T>();
    for (let x = Math.floor(box.x0 / this.cellM); x <= Math.floor(box.x1 / this.cellM); x++)
      for (let z = Math.floor(box.z0 / this.cellM); z <= Math.floor(box.z1 / this.cellM); z++)
        for (const item of this.cells.get(x + ":" + z) ?? []) found.add(item);
    return [...found];
  }
}
