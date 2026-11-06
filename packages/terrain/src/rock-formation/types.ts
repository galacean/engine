export type V2 = [number, number];
export type V3 = [number, number, number];
export type RockHeightMode = "random-ascent" | "perlin-ascent";
export type RockSurfaceMode = "vertex-slabs" | "cellular-curvature";
export type RockSlopeMode = "auto" | "manual";
export const DEFAULT_ROCK_HEIGHT_MODE: RockHeightMode = "random-ascent";
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
  /** Upper-vertex Y offset amplitude as a fraction of the OBB height. */
  heightVariation?: number;
}
export interface OutlineVertex {
  id: string;
  uv: V2;
  heightOffset?: number;
}
export interface VoronoiStart {
  algorithm: "voronoi-cell/v1";
  seed: number;
  sites: V2[];
  corners: V2[];
  edgeSplits: number;
}
export interface GuideProfile {
  obb: RockObb;
  outlineShape: "voronoi";
  top: OutlineVertex[];
  faces: { id: string; descentRate: number; bottomSplits: number[] }[];
}
export interface ProfileGeometry {
  id: string;
  top: V3[];
  upperBoundary?: V3[];
  capCenter?: V3;
  bottom: V3[];
  bottomByFace: V3[][];
  ground: V2[];
  struts: V3[][];
}
export interface MeshBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  guideNormals?: Float32Array;
  restPositions?: Float32Array;
  cornerNormals?: Float32Array;
  edgeNeighbors?: [Float32Array, Float32Array, Float32Array];
  barycentrics?: Float32Array;
  interpolatedNormals?: boolean;
  cellularShading?: {
    faceNormals: Float32Array;
    neighborNormals: Float32Array;
    edgeLengths: Float32Array;
    /** Shared vertex normals expanded to indexed corners before draw filtering. */
    smoothNormals?: Float32Array;
    /** Signed triangle altitudes opposite AB, BC, CA, in mesh units. */
    edgeAltitudes?: Float32Array;
    cells: Float32Array;
  };
}
export interface FractureSurface {
  mesh: MeshBuffers;
  cellular?: {
    cellIds: Uint32Array;
    cellKeys: string[];
    isTop: Uint32Array;
    triangleNeighbors: Int32Array;
  };
}
export interface RockDomain {
  minX: number;
  minZ: number;
  width: number;
  depth: number;
  resolution: number;
}
/** Native terrain samples cropped for one formation; no terrain regeneration in the rock worker. */
export interface RockGround {
  minX: number;
  minZ: number;
  spacingX: number;
  spacingZ: number;
  columns: number;
  rows: number;
  heights: Float32Array;
}
export interface RockFormationJob {
  id: string;
  seed: number;
  /** Enables both grass substrate coverage and blade support; omitted keeps terrain-rock grass. */
  surfaceGrass?: boolean;
  origin: V3;
  guides: RockObb[];
  domain: RockDomain;
  ground: RockGround;
}
export interface RockFormationMesh {
  id: string;
  origin: V3;
  mesh: MeshBuffers;
  /** Owner of each triangle, for the existing Seed World picking system. */
  owners: string[];
  /** Mixed formations only: one value per canonical triangle, 0 slabs / 1 curvature. */
  triangleSurfaces?: Uint8Array;
  /** Original painted-rock attributes; canonical render/collision positions stay shared. */
  painted?: RockPaintedSurface;
  /** Worker-prepared final-surface grass eligibility and small spatial patches. */
  grass?: import("./GrassSurface").RockGrassSurface;
  stats: { slabs: number; deformedVertices: number; generationMs: number };
}
export interface RockPaintedSurface {
  coverage: Float32Array;
  cavity: Float32Array;
  guideNormals: Float32Array;
  faceNormals: Float32Array;
  neighborNormals: Float32Array;
  /** Shared normal field per indexed corner, including filtered-out neighbors. */
  smoothNormals: Float32Array;
  /** Signed altitudes opposite AB, BC, CA in metres. */
  edgeAltitudes: Float32Array;
  /** Per-triangle stable source cell ID and random texture offset. */
  cells: Float32Array;
  cellScale: number;
}
