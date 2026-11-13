export type V2 = [number, number];
export type V3 = [number, number, number];
export type RockHeightMode = "random-ascent" | "perlin-ascent";
export type RockSurfaceMode = "vertex-slabs" | "cellular-curvature";
export type RockSlopeMode = "auto" | "manual";
export const DEFAULT_ROCK_HEIGHT_MODE: RockHeightMode = "random-ascent";
/** Upper-vertex Y offset amplitude as a fraction of the OBB height. */
export const DEFAULT_ROCK_HEIGHT_VARIATION = 0;
export interface RockObb {
  id: string;
  ownerId: string;
  center: V3;
  size: V3;
  axes: [V3, V3, V3];
  /** Omission uses the shared default height mode. */
  heightMode?: RockHeightMode;
  /** Omission follows the current formation default; explicit choices remain pinned. */
  surfaceMode?: RockSurfaceMode;
  /** Omission derives the base slope from the current OBB size. */
  slopeMode?: RockSlopeMode;
  /** Manual base slope in metres per metre; retained but ignored in automatic mode. */
  slopeRate?: number;
  /** Variation in [0, 1]: auto varies whole-box and face rates, manual only face rates. */
  slopeVariation?: number;
  /** Upper-vertex Y offset amplitude in [0, 1] of the OBB height; omission uses zero. */
  heightVariation?: number;
}
export interface MeshBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  /** Optional crease-preserving render normals, one XYZ per indexed corner. */
  cornerNormals?: Float32Array;
}
export interface RockFormationJob {
  id: string;
  seed: number;
  /** Explicit planning role; streamed and decorative stones never receive ridge arrangements. */
  kind?: "mountain";
  /** Atomic library seed shared by the world's mountains; topology still uses the job seed. */
  worldSeed?: number;
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
    buildMs?: number;
    simplifyMs?: number;
    simplifyAttempts?: number;
    fractureMs?: number;
    arrangementMs?: number;
    ridgePeaks?: number;
    ridgeBranches?: number;
    /** Boolean work is charged once per group; input counts remain per owner. */
    unionMs?: number;
    unionInputTriangles?: number;
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
