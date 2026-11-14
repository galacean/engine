import type { Texture2D } from "@galacean/engine";
import type { TerrainLayerResidencyRegionSource } from "../clipmap/TerrainLayerResidency";
import type { TerrainProjectAsset } from "./TerrainProjectAsset";
import { validateTerrainProjectLoadedSet, validateTerrainProjectRuntimeLoadedSet } from "./TerrainProjectCodec";
import { getTerrainProjectHoleSampleSize } from "./TerrainProjectContract";
import type {
  TerrainProjectDocument,
  TerrainProjectWorldIndex,
  TerrainSampleSize,
  TerrainVec3
} from "./TerrainProjectContract";
import type { TerrainClipmapDescriptor } from "../clipmap/TerrainClipmap";
import type { TerrainClipmapRegionSource } from "../clipmap/TerrainClipmapSource";
import { compareTerrainStableValues } from "../TerrainStableOrder";

/** Lossless Region height source independent of renderer topology. */
export interface TerrainProjectHeightSource extends TerrainClipmapRegionSource {
  id: string;
  worldPosition: TerrainVec3;
  worldSize: TerrainVec3;
  heightSampleSize: TerrainSampleSize;
  /** World-space height represented by an R16 sample value of zero. */
  heightDecodeOffset: number;
  /** World-space height interval represented by the full R16 UNORM range. */
  heightDecodeScale: number;
  heightSamples: Uint16Array;
  holesSampleSize: TerrainSampleSize;
  /** Exact R8 value representing a solid terrain cell. */
  holesSolidValue: number;
  holes: Uint8Array;
}

/** Pure-data capability descriptor accepted by the current Geometry Clipmap renderer. */
export interface TerrainProjectClipmapDescriptor extends TerrainClipmapDescriptor {
  sources: readonly TerrainProjectHeightSource[];
}

/** Stable failure codes for canonical data unsupported by the current Geometry Clipmap. */
export const TerrainClipmapCapabilityErrorCode = {
  EmptyActiveSet: "capability-empty-active-set",
  AnisotropicSpacing: "capability-anisotropic-spacing",
  NonuniformSpacing: "capability-nonuniform-spacing",
  GridMisalignment: "capability-grid-misalignment"
} as const;

/** Stable Geometry Clipmap capability failure code. */
export type TerrainClipmapCapabilityErrorCode =
  (typeof TerrainClipmapCapabilityErrorCode)[keyof typeof TerrainClipmapCapabilityErrorCode];

/** Error raised when valid canonical Regions exceed the current renderer's sampling capability. */
export class TerrainClipmapCapabilityError extends Error {
  /**
   * Creates one classifiable renderer capability failure.
   * @param code Stable machine-readable failure code.
   * @param message Human-readable failure detail.
   */
  constructor(
    readonly code: TerrainClipmapCapabilityErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TerrainClipmapCapabilityError";
  }
}

/**
 * Exposes complete Region sources without choosing renderer topology or resolution.
 * @param world Canonical world index.
 * @param documents Decoded Region subset.
 * @returns Lossless adapter records ordered by stable Region id.
 * @throws If a loaded Region or explicit loaded seam violates the contract.
 */
export function createTerrainProjectHeightSources(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): readonly TerrainProjectHeightSource[] {
  validateTerrainProjectLoadedSet(world, documents);
  return createTerrainProjectHeightSourcesUnchecked(documents);
}

function createTerrainProjectHeightSourcesUnchecked(
  documents: readonly TerrainProjectDocument[]
): readonly TerrainProjectHeightSource[] {
  return [...documents]
    .sort((left, right) => compareTerrainStableValues(left.descriptor.id, right.descriptor.id))
    .map((document) => ({
      id: document.descriptor.id,
      worldPosition: [...document.descriptor.worldPosition],
      worldSize: [...document.descriptor.worldSize],
      heightSampleSize: [...document.manifest.heightmap.sampleSize],
      heightDecodeOffset: document.descriptor.worldPosition[1] + document.manifest.heightmap.minMetres,
      heightDecodeScale: document.manifest.heightmap.maxMetres - document.manifest.heightmap.minMetres,
      heightSamples: document.heightmap,
      holesSampleSize: [...getTerrainProjectHoleSampleSize(document.manifest)],
      holesSolidValue: document.manifest.holes?.solidValue ?? 255,
      holes: document.holes
    }));
}

/**
 * Resolves canonical alphamaps and TerrainLayer semantics into renderer-owned residency input.
 * @param assets Loaded Region assets whose Texture refs were resolved by the standard Project pipeline.
 * @returns Stable detached records that borrow source Textures without taking ownership.
 */
export function createTerrainProjectLayerSources(
  assets: readonly TerrainProjectAsset[]
): readonly TerrainLayerResidencyRegionSource<Texture2D>[] {
  return [...assets]
    .sort((left, right) => compareTerrainStableValues(left.document.descriptor.id, right.document.descriptor.id))
    .map((asset) => {
      const { document } = asset;
      return {
        id: document.descriptor.id,
        alphamaps: document.manifest.alphamaps.map((alphamap, index) => ({
          sampleSize: [...alphamap.sampleSize],
          layers: [...alphamap.layers],
          weights: document.alphamaps[index]
        })),
        layers: document.manifest.layers.map((layer) => {
          const textures = asset.layerTextures.get(layer.id);
          if (!textures) {
            throw new Error(
              `Terrain Region "${document.descriptor.id}" layer "${layer.id}" has no resolved Texture resources`
            );
          }
          return {
            id: layer.id,
            diffuse: textures.diffuse,
            normal: textures.normal,
            mask: textures.mask,
            tileSize: [...layer.tileSize],
            tileOffset: [...layer.tileOffset],
            normalScale: layer.normalScale,
            diffuseRemapMin: [...layer.diffuseRemapMin],
            diffuseRemapMax: [...layer.diffuseRemapMax],
            maskRemapMin: [...layer.maskRemapMin],
            maskRemapMax: [...layer.maskRemapMax],
            metallic: layer.metallic,
            smoothness: layer.smoothness,
            specular: [...layer.specular],
            snowResponse: layer.snowResponse ?? 0.65
          };
        })
      };
    });
}

/**
 * Checks loaded canonical Regions against the current Geometry Clipmap sampling capability.
 * @param world Canonical world index.
 * @param documents Decoded Region subset.
 * @returns Renderer-neutral sources plus the exact Geometry Clipmap height-grid capability.
 * @throws If there are no Regions or their samples are anisotropic, nonuniform, or grid-misaligned.
 */
export function createTerrainProjectClipmapDescriptor(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): TerrainProjectClipmapDescriptor {
  return createTerrainProjectClipmapDescriptorFromSources(createTerrainProjectHeightSources(world, documents));
}

/**
 * Adapts render-only Regions without requiring authoring density payloads.
 * @param world Canonical world index.
 * @param documents Runtime-decoded Region subset.
 * @returns Renderer-neutral sources plus the exact Geometry Clipmap height-grid capability.
 * @throws If the runtime Regions are invalid or exceed the current Geometry Clipmap sampling capability.
 */
export function createTerrainProjectRuntimeClipmapDescriptor(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): TerrainProjectClipmapDescriptor {
  validateTerrainProjectRuntimeLoadedSet(world, documents);
  return createTerrainProjectClipmapDescriptorFromSources(createTerrainProjectHeightSourcesUnchecked(documents));
}

function createTerrainProjectClipmapDescriptorFromSources(
  sources: readonly TerrainProjectHeightSource[]
): TerrainProjectClipmapDescriptor {
  if (!sources.length) {
    throw new TerrainClipmapCapabilityError(
      TerrainClipmapCapabilityErrorCode.EmptyActiveSet,
      "Geometry Clipmap requires at least one active Terrain Region"
    );
  }

  const firstSource = sources[0];
  const firstSpacing = sourceSpacing(firstSource);
  if (!nearlyEqual(firstSpacing.x, firstSpacing.z)) {
    throw new TerrainClipmapCapabilityError(
      TerrainClipmapCapabilityErrorCode.AnisotropicSpacing,
      `Geometry Clipmap requires isotropic height spacing; Region "${firstSource.id}" differs`
    );
  }
  const spacing = firstSpacing.x;
  const gridOrigin = firstSource.worldPosition;
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (const source of sources) {
    minimumHeight = Math.min(minimumHeight, source.heightDecodeOffset);
    maximumHeight = Math.max(maximumHeight, source.heightDecodeOffset + source.heightDecodeScale);
    const regionSampleSpacing = sourceSpacing(source);
    if (!nearlyEqual(regionSampleSpacing.x, regionSampleSpacing.z)) {
      throw new TerrainClipmapCapabilityError(
        TerrainClipmapCapabilityErrorCode.AnisotropicSpacing,
        `Geometry Clipmap requires isotropic height spacing; Region "${source.id}" differs`
      );
    }
    if (!nearlyEqual(regionSampleSpacing.x, spacing)) {
      throw new TerrainClipmapCapabilityError(
        TerrainClipmapCapabilityErrorCode.NonuniformSpacing,
        `Geometry Clipmap requires uniform height spacing; Region "${source.id}" differs`
      );
    }
    if (
      !alignedToGrid(source.worldPosition[0] - gridOrigin[0], spacing) ||
      !alignedToGrid(source.worldPosition[2] - gridOrigin[2], spacing)
    ) {
      throw new TerrainClipmapCapabilityError(
        TerrainClipmapCapabilityErrorCode.GridMisalignment,
        `Geometry Clipmap requires Region "${source.id}" to share one height-sample grid`
      );
    }
  }
  return {
    vertexSpacing: spacing,
    minHeight: minimumHeight,
    maxHeight: maximumHeight,
    sources
  };
}

function sourceSpacing(source: TerrainProjectHeightSource): { x: number; z: number } {
  const [width, height] = source.heightSampleSize;
  return {
    x: source.worldSize[0] / (width - 1),
    z: source.worldSize[2] / (height - 1)
  };
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
}

function alignedToGrid(offset: number, spacing: number): boolean {
  const cell = offset / spacing;
  return Math.abs(cell - Math.round(cell)) <= Number.EPSILON * 16 * Math.max(1, Math.abs(cell));
}
