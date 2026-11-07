export interface ConstructionCollisionMesh {
  positions: number[][];
  indices: number[];
}
export interface ConstructionPreviewMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}
export type ConstructionPositionMesh = Pick<ConstructionPreviewMesh, "positions" | "indices">;
export interface ConstructionStoneMesh extends ConstructionPositionMesh {
  bounds: { min: number[]; max: number[] };
  /** Native warped stone caps use location 6; affine frames do not. */
  bbx?: number[];
}
export type ConstructionStoneGeometry = Record<string, ConstructionStoneMesh>;
export function requireConstructionStoneMesh(
  geometry: ConstructionStoneGeometry | undefined,
  template: string
): ConstructionStoneMesh {
  const mesh = geometry?.[template];
  if (!mesh) throw Error("Missing decoration geometry in construction VFS: " + template);
  return mesh;
}
export interface GothicGeometryAssets {
  collision: ConstructionCollisionMesh;
}
export type ConstructionGeometryUnit = {
  frameTemplate: string;
  glassTemplate: string;
  glassAlbedoSlot: number;
  collisionBounds: { min: number[]; max: number[] };
  geometry: GothicGeometryAssets;
};
