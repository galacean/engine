/** Checks and vector math for building meshes from code. Coordinates are in metres. */
export type BuildingPoint = [number, number, number];
export interface BuildingMeshData {
  positions: readonly BuildingPoint[];
  uvs: readonly [number, number][];
  indices: readonly number[];
}
export const cross = (a: readonly number[], b: readonly number[]): BuildingPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export function point(value: readonly number[], label = "Point"): BuildingPoint {
  if (value.length !== 3 || !value.every(Number.isFinite)) throw Error(`${label} needs three finite coordinates`);
  return [...value] as BuildingPoint;
}
export function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw Error(`${label} must be positive and finite`);
  return value;
}
export function budget(count: number, limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(count) || count > limit)
    throw Error(`Placement budget exceeded: ${count} candidates, limit ${limit}`);
}
