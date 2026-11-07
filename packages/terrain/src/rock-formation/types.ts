export type V2 = [number, number];
export type V3 = [number, number, number];
export interface RockObb {
  id: string;
  ownerId: string;
  center: V3;
  size: V3;
  axes: [V3, V3, V3];
}
export interface MeshBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
}
export interface RockFormationJob {
  id: string;
  seed: number;
  /** Enables both grass substrate coverage and blade support; omitted keeps terrain-rock grass. */
  surfaceGrass?: boolean;
  origin: V3;
  guides: RockObb[];
}
export interface RockFormationMesh {
  id: string;
  origin: V3;
  mesh: MeshBuffers;
  /** Owner of each triangle, for the existing Seed World picking system. */
  owners: string[];
  /** Worker-prepared final-surface grass eligibility and small spatial patches. */
  grass?: import("./GrassSurface").RockGrassSurface;
  textureScale?: number;
  stats: {
    bodies: number;
    vertices: number;
    rawTriangles?: number;
    targetTriangles?: number;
    overBudgetBodies?: number;
    generationMs: number;
  };
}

/** Final indexed surface in world-space metres. */
export interface RockSurface {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  envelopeBounds?: [number[], number[]];
  bounds: [number[], number[]];
}
