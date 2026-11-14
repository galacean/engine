/** Terrain Project contract version embedded in every canonical JSON asset. */
export const TERRAIN_PROJECT_VERSION = "1.0" as const;
/** Canonical orientation shared by every two-dimensional Terrain payload. */
export const TERRAIN_RASTER_LAYOUT = "row-major-x-fast-local-positive-z" as const;
/** Canonical exact-detail transform payload layout. */
export const TERRAIN_DETAIL_TRANSFORM_FORMAT = "f32-le-local-position-rotation-y-scale-xz-y" as const;
/** Canonical virtual path for the domain world index. */
export const TERRAIN_WORLD_INDEX_PATH = "World/Terrain.world.json" as const;

/** Serializable two-component numeric tuple. */
export type TerrainVec2 = [number, number];
/** Serializable three-component numeric tuple. */
export type TerrainVec3 = [number, number, number];
/** Serializable four-component numeric tuple. */
export type TerrainVec4 = [number, number, number, number];
/** Width and height sample counts for a row-major raster. */
export type TerrainSampleSize = [width: number, height: number];

/** Reference to one virtual resource declared by `project.json`. */
export interface TerrainProjectRef {
  url: string;
  /** Standard Project subresource selector appended to an explicit `ResourceManager.load` request. */
  key?: string;
}

/** Exact Prefab component selector for one primitive `MeshRenderer`. */
export interface TerrainProjectPrototypeRenderer {
  entityPath: number[];
  componentIndex: number;
  /** Explicit Prefab-authored capability for exact Detail instance attributes. */
  detailInstancing?: true;
  /** Explicit Prefab-authored capability for cylindrical Billboard instance attributes. */
  billboardInstancing?: true;
}

/** One authored LOD and its screen-relative transition threshold. */
export interface TerrainProjectPrototypeLod {
  screenRelativeTransitionHeight: number;
  fadeTransitionWidth: number;
  renderers: TerrainProjectPrototypeRenderer[];
}

/** Authoring LODGroup semantics serialized by the prototype Prefab metadata Script. */
export interface TerrainProjectLodGroup {
  fadeMode: "None" | "CrossFade";
  animateCrossFading: boolean;
  /** Authored local-space center used for screen-relative height. */
  localReferencePoint: TerrainVec3;
  /** Authored local-space reference diameter used for screen-relative height. */
  size: number;
  lods: TerrainProjectPrototypeLod[];
}

/** Prefab metadata geometry with or without an authored LODGroup. */
export type TerrainProjectPrototypeGeometry =
  | {
      kind: "lod-group";
      lodGroup: TerrainProjectLodGroup;
    }
  | {
      kind: "renderers";
      renderers: TerrainProjectPrototypeRenderer[];
    };

/** One painted terrain layer with complete source texture semantics. */
export interface TerrainProjectLayer {
  id: string;
  name: string;
  diffuse: TerrainProjectRef;
  normal: TerrainProjectRef;
  mask?: TerrainProjectRef;
  tileSize: TerrainVec2;
  tileOffset: TerrainVec2;
  normalScale: number;
  diffuseRemapMin: TerrainVec4;
  diffuseRemapMax: TerrainVec4;
  maskRemapMin: TerrainVec4;
  maskRemapMax: TerrainVec4;
  metallic: number;
  smoothness: number;
  specular: TerrainVec4;
  /** Relative dynamic snow acceptance blended through the authored Terrain alphamap. */
  snowResponse?: number;
}

/** Reusable tree Prefab and source placement metadata. */
export interface TerrainProjectTreePrototype {
  id: string;
  name: string;
  prefab: TerrainProjectRef;
  bendFactor: number;
  navMeshLod: number;
}

/** Exact tree placement relative to one Region origin. */
export interface TerrainProjectTreeInstance {
  id: string;
  prototypeId: string;
  /** Region-local position in metres, relative to the world-index Region origin. */
  localPosition: TerrainVec3;
  rotationYRadians: number;
  scale: TerrainVec3;
  color: TerrainVec4;
  lightmapColor: TerrainVec4;
}

/** Reusable ordinary Prefab placed explicitly in one Region. */
export interface TerrainProjectPlacedPrefabPrototype {
  id: string;
  name: string;
  prefab: TerrainProjectRef;
}

/** Exact ordinary Prefab placement relative to one Region origin. */
export interface TerrainProjectPlacedPrefabInstance {
  id: string;
  prototypeId: string;
  /** Region-local position in metres, relative to the world-index Region origin. */
  localPosition: TerrainVec3;
  /** Complete Region-local unit quaternion in `[x, y, z, w]` order. */
  localRotationQuaternion: TerrainVec4;
  /** Authored three-axis scale; components are independent. */
  localScale: TerrainVec3;
}

/** Decoded exact detail placements without renderer-specific state. */
export interface TerrainProjectDetailTransforms {
  /** Number of six-component transform records. */
  readonly count: number;
  /** Interleaved `[localX, localY, localZ, rotationY, scaleXZ, scaleY]` float records. */
  readonly values: Float32Array;
}

/** Reusable detail source plus its exact or explicitly empty density declaration. */
export interface TerrainProjectDetailPrototype {
  id: string;
  name: string;
  prefab?: TerrainProjectRef;
  texture?: TerrainProjectRef;
  densitySampleSize: TerrainSampleSize;
  density:
    | {
        kind: "r8-count";
        data: TerrainProjectRef;
        layout: typeof TERRAIN_RASTER_LAYOUT;
        sha256: string;
      }
    | {
        kind: "empty";
      };
  /** Optional exact placements encoded as a counted little-endian float payload. */
  exactTransforms?: {
    data: TerrainProjectRef;
    format: typeof TERRAIN_DETAIL_TRANSFORM_FORMAT;
    count: number;
    sha256: string;
  };
  healthyColor: TerrainVec4;
  dryColor: TerrainVec4;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  maximumSourceCount: number;
  noiseSeed: number;
  noiseSpread: number;
  renderMode: string;
  useInstancing: boolean;
  usePrototypeMesh: boolean;
}

/** Serializable canonical Region loaded through the stock JSON loader. */
export interface TerrainProjectRegion {
  version: typeof TERRAIN_PROJECT_VERSION;
  name: string;
  material: TerrainProjectRef;
  heightmap: {
    data: TerrainProjectRef;
    format: "r16-unorm-le";
    layout: typeof TERRAIN_RASTER_LAYOUT;
    sampleLayout: "uniform-inclusive";
    sampleSize: TerrainSampleSize;
    minMetres: number;
    maxMetres: number;
    sha256: string;
  };
  holes?: {
    data: TerrainProjectRef;
    format: "r8-unorm";
    layout: typeof TERRAIN_RASTER_LAYOUT;
    /** Uniform cells covering the complete Region XZ extent; unlike height samples, boundaries are not duplicated. */
    sampleSize: TerrainSampleSize;
    solidValue: 255;
    sha256: string;
  };
  alphamaps: Array<{
    data: TerrainProjectRef;
    format: "rgba8-unorm";
    layout: typeof TERRAIN_RASTER_LAYOUT;
    sampleSize: TerrainSampleSize;
    /** Four physical channels; `null` marks an unused channel. */
    layers: [string | null, string | null, string | null, string | null];
    /** Independent UNORM8 weights; totals across maps are not normalized by the contract. */
    sha256: string;
  }>;
  layers: TerrainProjectLayer[];
  treePrototypes: TerrainProjectTreePrototype[];
  treeInstances: TerrainProjectTreeInstance[];
  /** Ordinary placed Prefabs stay distinct from source Terrain tree and detail declarations. */
  placedPrefabPrototypes?: TerrainProjectPlacedPrefabPrototype[];
  /** Explicit Region-local transforms referring to `placedPrefabPrototypes`. */
  placedPrefabInstances?: TerrainProjectPlacedPrefabInstance[];
  detailResolutionPerPatch: number;
  detailPrototypes: TerrainProjectDetailPrototype[];
  grassWind: {
    speed: number;
    size: number;
    bending: number;
    tint: TerrainVec4;
  };
}

/** Decoded Region data after standard Project refs resolve. */
export interface TerrainProjectDocument {
  descriptor: TerrainProjectWorldRegion;
  manifest: TerrainProjectRegion;
  heightmap: Uint16Array;
  holes: Uint8Array;
  alphamaps: readonly Uint8Array[];
  detailMaps: ReadonlyMap<string, Uint8Array>;
  detailTransforms: ReadonlyMap<string, TerrainProjectDetailTransforms>;
}

/** One progressively loadable Region entry in the canonical world index. */
export interface TerrainProjectWorldRegion {
  id: string;
  manifest: TerrainProjectRef;
  worldPosition: TerrainVec3;
  worldSize: TerrainVec3;
}

/** One named side of a potentially partial height seam. */
export interface TerrainProjectSeamSide {
  regionId: string;
  edge: "min-x" | "max-x" | "min-z" | "max-z";
  /** Inclusive local metres along the edge's positive tangent direction. */
  rangeMetres: [number, number];
}

/** Explicit renderer-independent height seam between two Region edge ranges. */
export interface TerrainProjectHeightSeam {
  id: string;
  first: TerrainProjectSeamSide;
  second: TerrainProjectSeamSide;
  comparison: "linear-world-space";
}

/** Canonical world index loaded as one stock Project JSON asset. */
export interface TerrainProjectWorldIndex {
  version: typeof TERRAIN_PROJECT_VERSION;
  regions: TerrainProjectWorldRegion[];
  heightSeams: TerrainProjectHeightSeam[];
  /** Offline identity emitted for a packaged Project artifact and verified by the importer. */
  contentHash?: string;
}

/** Minimal stock Project schema with no Terrain-specific fields. */
export interface TerrainProjectFile {
  engineVersion?: string;
  scene: string;
  /** All Scenes registered by a multi-demo release project. */
  scenes?: string[];
  files: Array<{
    id: string;
    virtualPath: string;
    path: string;
    type: string;
    params?: Record<string, unknown>;
  }>;
}

/** Returns the hole raster shape used when a project intentionally has no hole asset. */
export function getTerrainProjectHoleSampleSize(
  manifest: Pick<TerrainProjectRegion, "heightmap" | "holes">
): TerrainSampleSize {
  return manifest.holes?.sampleSize ?? [manifest.heightmap.sampleSize[0] - 1, manifest.heightmap.sampleSize[1] - 1];
}
