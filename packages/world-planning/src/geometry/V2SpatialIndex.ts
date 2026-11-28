import type { V2Bounds } from "../spatial/V2Model.ts";

/** Uniform world-space index shared by local collision and path/rock contact queries. */
export class V2SpatialIndex<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly cellSize = 16) {}
  add(value: T, bounds: V2Bounds): void {
    this.cellsFor(bounds, (key) => {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(value);
      else this.cells.set(key, [value]);
    });
  }
  query(bounds: V2Bounds): T[] {
    const result = new Set<T>();
    this.cellsFor(bounds, (key) => this.cells.get(key)?.forEach((value) => result.add(value)));
    return [...result];
  }
  private cellsFor(b: V2Bounds, visit: (key: string) => void): void {
    for (let z = Math.floor(b.minZ / this.cellSize); z <= Math.floor(b.maxZ / this.cellSize); z++)
      for (let x = Math.floor(b.minX / this.cellSize); x <= Math.floor(b.maxX / this.cellSize); x++) visit(`${x},${z}`);
  }
}
