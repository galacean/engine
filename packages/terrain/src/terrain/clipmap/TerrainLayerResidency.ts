import {
  packTerrainAtlasRectangles,
  TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS,
  compareTerrainStableIds,
  TerrainAtlasError,
  TerrainAtlasErrorCode
} from "./TerrainHeightAtlas";

/** Maximum authored alphamap count evaluated for one active Region. */
export const TERRAIN_LAYER_MAX_ALPHAMAPS_PER_REGION = 16;

/** Stable failure codes exposed by Terrain layer residency. */
export const TerrainLayerResidencyErrorCode = {
  InvalidDeviceLimit: "invalid-device-limit",
  InvalidSource: "invalid-source",
  ActiveRegionLimit: "capability-active-region-limit",
  AlphamapCountLimit: "capability-alphamap-count-limit",
  TextureSizeLimit: "capability-texture-size-limit",
  TextureArrayLayerLimit: "capability-texture-array-layer-limit",
  AtlasCapacity: "capability-atlas-capacity",
  AtlasSearchIncomplete: "capability-atlas-search-incomplete",
  UnsupportedLayerTexture: "capability-unsupported-layer-texture"
} as const;

/** Stable failure code emitted by {@link TerrainLayerResidencyError}. */
export type TerrainLayerResidencyErrorCode =
  (typeof TerrainLayerResidencyErrorCode)[keyof typeof TerrainLayerResidencyErrorCode];

/** Error raised when canonical layer input is invalid or exceeds renderer capability. */
export class TerrainLayerResidencyError extends Error {
  /**
   * Creates one classifiable Terrain layer residency failure.
   * @param code Stable machine-readable failure code.
   * @param message Human-readable failure detail.
   * @param options Optional underlying failure.
   */
  constructor(
    readonly code: TerrainLayerResidencyErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "TerrainLayerResidencyError";
  }
}

/** One resolved renderer texture plus the complete authored TerrainLayer semantics. */
export interface TerrainLayerResolvedSource<TTexture> {
  readonly id: string;
  /** Opt-in immutable texture content revision. Change it whenever any texture pixels change. */
  readonly textureContentId?: string;
  /** Optional shared colour-field role, independent of layer ids, channels and Region ordering. */
  readonly appearance?: "grass" | "road";
  readonly diffuse?: TTexture;
  readonly normal?: TTexture;
  readonly mask?: TTexture;
  readonly tileSize: readonly [x: number, y: number];
  readonly tileOffset: readonly [x: number, y: number];
  readonly normalScale: number;
  readonly diffuseRemapMin: readonly [x: number, y: number, z: number, w: number];
  readonly diffuseRemapMax: readonly [x: number, y: number, z: number, w: number];
  readonly maskRemapMin: readonly [x: number, y: number, z: number, w: number];
  readonly maskRemapMax: readonly [x: number, y: number, z: number, w: number];
  readonly metallic: number;
  readonly smoothness: number;
  readonly specular: readonly [x: number, y: number, z: number, w: number];
  readonly snowResponse: number;
}

/** One decoded canonical RGBA8 alphamap with physical channel declarations. */
export interface TerrainLayerAlphamapSource {
  readonly sampleSize: readonly [width: number, height: number];
  readonly layers: readonly [string | null, string | null, string | null, string | null];
  readonly weights: Uint8Array;
}

/** Renderer-neutral layer and alphamap input for one active Region. */
export interface TerrainLayerResidencyRegionSource<TTexture> {
  readonly id: string;
  readonly alphamaps: readonly TerrainLayerAlphamapSource[];
  readonly layers: readonly TerrainLayerResolvedSource<TTexture>[];
}

/** Stable layer slot retained by the transient renderer packing. */
export interface TerrainLayerResidencyLayer<TTexture> extends TerrainLayerResolvedSource<TTexture> {
  readonly regionId: string;
  readonly index: number;
  /** Renderer encoding: ordinary = 0, grass field = 1, road colour = 2. */
  readonly appearanceRole: 0 | 1 | 2;
  /** Dense image-array slots; -1 means this logical layer uses a constant instead. */
  readonly diffuseTextureIndex: number;
  readonly normalTextureIndex: number;
  readonly maskTextureIndex: number;
}

/** Stable alphamap slot and atlas placement retained by the transient renderer packing. */
export interface TerrainLayerResidencyAlphamap {
  readonly regionId: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layerIndices: readonly [number, number, number, number];
}

/** Per-Region range into the stable alphamap metadata rows. */
export interface TerrainLayerResidencyRegion {
  readonly id: string;
  readonly alphamapOffset: number;
  readonly alphamapCount: number;
}

/** Texture families whose authored semantics can affect the packed Terrain layers. */
export interface TerrainLayerTextureUsage {
  readonly diffuse: boolean;
  readonly normal: boolean;
  readonly mask: boolean;
}

/** CPU-side transient packing uploaded into renderer-owned textures. */
export interface TerrainLayerResidencyPacking<TTexture> {
  readonly alphamapAtlasWidth: number;
  readonly alphamapAtlasHeight: number;
  readonly alphamapAtlasPixels: Uint8Array;
  readonly alphamapMetadataWidth: 2;
  readonly alphamapMetadataHeight: number;
  readonly alphamapMetadataPixels: Float32Array;
  readonly layerMetadataWidth: 8;
  readonly layerMetadataHeight: number;
  readonly layerMetadataPixels: Float32Array;
  readonly regions: readonly TerrainLayerResidencyRegion[];
  readonly alphamaps: readonly TerrainLayerResidencyAlphamap[];
  readonly layers: readonly TerrainLayerResidencyLayer<TTexture>[];
  readonly textureUsage: TerrainLayerTextureUsage;
  /** A single shared image can be borrowed directly, including GPU-compressed Texture2D sources. */
  readonly singleDiffuseTexture?: TTexture;
}

/** Texture families materialized as renderer-owned array textures. */
export type TerrainLayerTextureKind = "diffuse" | "normal" | "mask";

/** Backend boundary used to materialize a pure residency packing. */
export interface TerrainLayerResidencyBackend<TTexture, TResource> {
  /** Creates the packed RGBA8 alphamap texture. */
  createAlphamapAtlas(width: number, height: number, pixels: Uint8Array, linearFiltering: boolean): TResource;
  /** Creates one point-sampled RGBA32F metadata texture. */
  createMetadataTexture(name: string, width: number, height: number, pixels: Float32Array): TResource;
  /** Copies borrowed resolved textures into one renderer-owned texture array. */
  createLayerTextureArray(
    kind: TerrainLayerTextureKind,
    sources: readonly (TTexture | undefined)[],
    contentIds?: readonly (string | undefined)[]
  ): TResource;
  /** Releases one resource created by this backend. */
  destroy(resource: TResource): void;
}

/** Renderer-owned resources created from one Terrain layer packing. */
export interface TerrainLayerResidencyResources<TResource> {
  readonly alphamapAtlas: TResource;
  readonly alphamapMetadata: TResource;
  readonly layerMetadata: TResource;
  readonly diffuseTextures?: TResource;
  readonly normalTextures?: TResource;
  readonly maskTextures?: TResource;

  /** Releases all derived resources exactly once. */
  destroy(): void;
}

/**
 * Builds stable CPU residency state from canonical alphamaps and resolved layer textures.
 * @param sources Active Region layer sources in any order.
 * @param maxTextureSize Device texture dimension limit.
 * @param maxTextureArrayLayers Device texture-array layer limit.
 * @returns Stable transient packing independent of active Region order.
 * @throws If source data is invalid or the active set exceeds renderer capability.
 */
export function packTerrainLayerResidency<TTexture>(
  sources: readonly TerrainLayerResidencyRegionSource<TTexture>[],
  maxTextureSize: number,
  maxTextureArrayLayers: number
): TerrainLayerResidencyPacking<TTexture> {
  validateDeviceLimit(maxTextureSize, "texture-size");
  validateDeviceLimit(maxTextureArrayLayers, "texture-array-layer");
  if (sources.length > TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS) {
    throw new TerrainLayerResidencyError(
      TerrainLayerResidencyErrorCode.ActiveRegionLimit,
      `Terrain layer residency supports at most ${TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS} active Regions; received ${sources.length}`
    );
  }

  const regionsById = [...sources].sort((left, right) => compareTerrainStableIds(left.id, right.id));
  const layers: TerrainLayerResidencyLayer<TTexture>[] = [];
  const pendingAlphamaps: PendingAlphamap[] = [];
  const regions: TerrainLayerResidencyRegion[] = [];
  let diffuseCount = 0,
    normalCount = 0,
    maskCount = 0;
  const sharedLayers = new Map<TerrainLayerResolvedSource<TTexture>, number>();
  for (let regionIndex = 0; regionIndex < regionsById.length; regionIndex++) {
    const region = regionsById[regionIndex];
    validateStableId(region.id, "Region");
    if (regionIndex > 0 && region.id === regionsById[regionIndex - 1].id) {
      invalidSource(`Terrain layer residency contains duplicate Region id "${region.id}"`);
    }
    if (region.alphamaps.length > TERRAIN_LAYER_MAX_ALPHAMAPS_PER_REGION) {
      throw new TerrainLayerResidencyError(
        TerrainLayerResidencyErrorCode.AlphamapCountLimit,
        `Terrain Region "${region.id}" has ${region.alphamaps.length} alphamaps; renderer supports at most ${TERRAIN_LAYER_MAX_ALPHAMAPS_PER_REGION}`
      );
    }

    const localLayers = [...region.layers].sort((left, right) => compareTerrainStableIds(left.id, right.id));
    const layerIndices = new Map<string, number>();
    for (let layerIndex = 0; layerIndex < localLayers.length; layerIndex++) {
      const layer = localLayers[layerIndex];
      validateStableId(layer.id, `Terrain Region "${region.id}" layer`);
      if (layerIndex > 0 && layer.id === localLayers[layerIndex - 1].id) {
        invalidSource(`Terrain Region "${region.id}" contains duplicate layer id "${layer.id}"`);
      }
      validateLayerSemantics(region.id, layer);
      const previousIndex = sharedLayers.get(layer);
      const index = previousIndex ?? layers.length;
      layerIndices.set(layer.id, index);
      if (previousIndex === undefined) {
        sharedLayers.set(layer, index);
        layers.push({
          ...layer,
          regionId: region.id,
          index,
          appearanceRole: layer.appearance === "grass" ? 1 : layer.appearance === "road" ? 2 : 0,
          diffuseTextureIndex: layerUsesDiffuseTexture(layer) ? diffuseCount++ : -1,
          normalTextureIndex: layer.normalScale !== 0 ? normalCount++ : -1,
          maskTextureIndex: layer.mask !== undefined ? maskCount++ : -1
        });
      }
    }

    const alphamapOffset = pendingAlphamaps.length;
    region.alphamaps.forEach((alphamap, alphamapIndex) => {
      const [width, height] = alphamap.sampleSize;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        invalidSource(`Terrain Region "${region.id}" alphamap ${alphamapIndex} has an invalid sample size`);
      }
      if (alphamap.weights.length !== width * height * 4) {
        invalidSource(
          `Terrain Region "${region.id}" alphamap ${alphamapIndex} payload size does not match its RGBA8 sample size`
        );
      }
      const channelIndices = alphamap.layers.map((layerId, channelIndex) => {
        if (layerId === null) return -1;
        const index = layerIndices.get(layerId);
        if (index === undefined) {
          invalidSource(
            `Terrain Region "${region.id}" alphamap ${alphamapIndex} channel ${channelIndex} references missing layer "${layerId}"`
          );
        }
        return index!;
      }) as [number, number, number, number];
      pendingAlphamaps.push({
        atlasId: encodeAlphamapId(region.id, alphamapIndex),
        regionId: region.id,
        index: alphamapIndex,
        width,
        height,
        layerIndices: channelIndices,
        weights: alphamap.weights
      });
    });
    regions.push({ id: region.id, alphamapOffset, alphamapCount: region.alphamaps.length });
  }

  const textureUsage: TerrainLayerTextureUsage = {
    diffuse: layers.some(layerUsesDiffuseTexture),
    normal: layers.some((layer) => layer.normalScale !== 0),
    mask: layers.some((layer) => layer.mask !== undefined)
  };
  const diffuseLayers = layers.filter((layer) => layer.diffuseTextureIndex >= 0);
  const firstDiffuse = diffuseLayers[0]?.diffuse;
  const singleDiffuseTexture =
    firstDiffuse !== undefined && diffuseLayers.every((layer) => layer.diffuse === firstDiffuse)
      ? firstDiffuse
      : undefined;
  if (Math.max(singleDiffuseTexture !== undefined ? 0 : diffuseCount, normalCount, maskCount) > maxTextureArrayLayers) {
    throw new TerrainLayerResidencyError(
      TerrainLayerResidencyErrorCode.TextureArrayLayerLimit,
      `Terrain layer residency requires ${Math.max(diffuseCount, normalCount, maskCount)} texture-array layers; device supports ${maxTextureArrayLayers}`
    );
  }
  if (layers.length > maxTextureSize || pendingAlphamaps.length > maxTextureSize) {
    throw new TerrainLayerResidencyError(
      TerrainLayerResidencyErrorCode.TextureSizeLimit,
      `Terrain layer metadata requires ${layers.length} layer rows and ${pendingAlphamaps.length} alphamap rows; device texture limit is ${maxTextureSize}`
    );
  }

  const atlas = packAlphamapAtlas(pendingAlphamaps, maxTextureSize);
  const rectangleById = new Map(atlas.rectangles.map((rectangle) => [rectangle.id, rectangle]));
  const alphamapAtlasPixels = new Uint8Array(atlas.width * atlas.height * 4);
  const alphamaps = pendingAlphamaps.map((alphamap) => {
    const rectangle = rectangleById.get(alphamap.atlasId)!;
    copyRgbaRows(
      alphamap.weights,
      alphamap.width,
      alphamap.height,
      alphamapAtlasPixels,
      atlas.width,
      rectangle.x,
      rectangle.y
    );
    return {
      regionId: alphamap.regionId,
      index: alphamap.index,
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
      layerIndices: alphamap.layerIndices
    };
  });

  const alphamapMetadataHeight = Math.max(1, alphamaps.length);
  const alphamapMetadataPixels = new Float32Array(2 * alphamapMetadataHeight * 4);
  alphamaps.forEach((alphamap, index) => {
    const rowOffset = index * 8;
    alphamapMetadataPixels.set([alphamap.x, alphamap.y, alphamap.width, alphamap.height], rowOffset);
    alphamapMetadataPixels.set(alphamap.layerIndices, rowOffset + 4);
  });

  const layerMetadataHeight = Math.max(1, layers.length);
  const layerMetadataPixels = new Float32Array(8 * layerMetadataHeight * 4);
  layers.forEach((layer, index) => writeLayerMetadata(layerMetadataPixels, index, layer));
  return {
    alphamapAtlasWidth: atlas.width,
    alphamapAtlasHeight: atlas.height,
    alphamapAtlasPixels,
    alphamapMetadataWidth: 2,
    alphamapMetadataHeight,
    alphamapMetadataPixels,
    layerMetadataWidth: 8,
    layerMetadataHeight,
    layerMetadataPixels,
    regions,
    alphamaps,
    layers,
    textureUsage,
    singleDiffuseTexture
  };
}

/**
 * Materializes and owns every GPU resource derived from one pure packing.
 * @param packing Stable CPU residency state.
 * @param backend Renderer resource factory and release boundary.
 * @returns Idempotently disposable derived resources.
 * @throws If any renderer resource cannot be created; already-created resources are released.
 */
export function createTerrainLayerResidencyResources<TTexture, TResource>(
  packing: TerrainLayerResidencyPacking<TTexture>,
  backend: TerrainLayerResidencyBackend<TTexture, TResource>
): TerrainLayerResidencyResources<TResource> {
  const owned: TResource[] = [];
  const create = (factory: () => TResource): TResource => {
    const resource = factory();
    owned.push(resource);
    return resource;
  };

  try {
    const alphamapAtlas = create(() =>
      backend.createAlphamapAtlas(
        packing.alphamapAtlasWidth,
        packing.alphamapAtlasHeight,
        packing.alphamapAtlasPixels,
        packing.alphamaps.length === 1
      )
    );
    const alphamapMetadata = create(() =>
      backend.createMetadataTexture(
        "Terrain alphamap metadata",
        packing.alphamapMetadataWidth,
        packing.alphamapMetadataHeight,
        packing.alphamapMetadataPixels
      )
    );
    const layerMetadata = create(() =>
      backend.createMetadataTexture(
        "Terrain layer metadata",
        packing.layerMetadataWidth,
        packing.layerMetadataHeight,
        packing.layerMetadataPixels
      )
    );
    const diffuseTextures =
      packing.textureUsage.diffuse && packing.singleDiffuseTexture === undefined
        ? create(() =>
            backend.createLayerTextureArray(
              "diffuse",
              packing.layers.filter((layer) => layer.diffuseTextureIndex >= 0).map((layer) => layer.diffuse),
              packing.layers.filter((layer) => layer.diffuseTextureIndex >= 0).map((layer) => layer.textureContentId)
            )
          )
        : undefined;
    const normalTextures = packing.textureUsage.normal
      ? create(() =>
          backend.createLayerTextureArray(
            "normal",
            packing.layers.filter((layer) => layer.normalTextureIndex >= 0).map((layer) => layer.normal),
            packing.layers.filter((layer) => layer.normalTextureIndex >= 0).map((layer) => layer.textureContentId)
          )
        )
      : undefined;
    const maskTextures = packing.textureUsage.mask
      ? create(() =>
          backend.createLayerTextureArray(
            "mask",
            packing.layers.filter((layer) => layer.maskTextureIndex >= 0).map((layer) => layer.mask),
            packing.layers.filter((layer) => layer.maskTextureIndex >= 0).map((layer) => layer.textureContentId)
          )
        )
      : undefined;

    let destroyed = false;
    return {
      alphamapAtlas,
      alphamapMetadata,
      layerMetadata,
      diffuseTextures,
      normalTextures,
      maskTextures,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        for (let index = owned.length - 1; index >= 0; index--) backend.destroy(owned[index]);
      }
    };
  } catch (error) {
    for (let index = owned.length - 1; index >= 0; index--) backend.destroy(owned[index]);
    throw error;
  }
}

interface PendingAlphamap {
  readonly atlasId: string;
  readonly regionId: string;
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly layerIndices: readonly [number, number, number, number];
  readonly weights: Uint8Array;
}

function packAlphamapAtlas(alphamaps: readonly PendingAlphamap[], maxTextureSize: number) {
  if (!alphamaps.length) {
    return { width: 1, height: 1, rectangles: [] } as const;
  }
  try {
    return packTerrainAtlasRectangles(
      alphamaps.map((alphamap) => ({ id: alphamap.atlasId, width: alphamap.width, height: alphamap.height })),
      maxTextureSize
    );
  } catch (error) {
    if (!(error instanceof TerrainAtlasError)) throw error;
    const code =
      error.code === TerrainAtlasErrorCode.TextureSizeLimit
        ? TerrainLayerResidencyErrorCode.TextureSizeLimit
        : error.code === TerrainAtlasErrorCode.InvalidDeviceLimit
          ? TerrainLayerResidencyErrorCode.InvalidDeviceLimit
          : error.code === TerrainAtlasErrorCode.InvalidSource
            ? TerrainLayerResidencyErrorCode.InvalidSource
            : error.code === TerrainAtlasErrorCode.AtlasSearchIncomplete
              ? TerrainLayerResidencyErrorCode.AtlasSearchIncomplete
              : TerrainLayerResidencyErrorCode.AtlasCapacity;
    throw new TerrainLayerResidencyError(code, `Terrain alphamap atlas packing failed: ${error.message}`, {
      cause: error
    });
  }
}

function writeLayerMetadata<TTexture>(
  pixels: Float32Array,
  index: number,
  layer: TerrainLayerResidencyLayer<TTexture>
): void {
  // Column 5.w owns the appearance role; column 7.w already identifies mask presence (-1 = absent).
  const offset = index * 32;
  pixels.set([...layer.tileSize, ...layer.tileOffset], offset);
  pixels.set(layer.diffuseRemapMin, offset + 4);
  pixels.set(layer.diffuseRemapMax, offset + 8);
  pixels.set(layer.maskRemapMin, offset + 12);
  pixels.set(layer.maskRemapMax, offset + 16);
  pixels.set([layer.normalScale, layer.metallic, layer.smoothness, layer.appearanceRole], offset + 20);
  pixels.set(layer.specular, offset + 24);
  pixels.set(
    [layer.snowResponse, layer.diffuseTextureIndex, layer.normalTextureIndex, layer.maskTextureIndex],
    offset + 28
  );
}

function copyRgbaRows(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint8Array,
  targetWidth: number,
  targetX: number,
  targetY: number
): void {
  const rowLength = sourceWidth * 4;
  for (let y = 0; y < sourceHeight; y++) {
    const sourceOffset = y * rowLength;
    const targetOffset = ((targetY + y) * targetWidth + targetX) * 4;
    target.set(source.subarray(sourceOffset, sourceOffset + rowLength), targetOffset);
  }
}

function validateLayerSemantics<TTexture>(regionId: string, layer: TerrainLayerResolvedSource<TTexture>): void {
  if (layer.appearance !== undefined && layer.appearance !== "grass" && layer.appearance !== "road") {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" has an invalid appearance role`);
  }
  if (layer.tileSize.some((value) => !Number.isFinite(value) || value <= 0)) {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" has an invalid tile size`);
  }
  const finiteValues = [
    ...layer.tileOffset,
    layer.normalScale,
    ...layer.diffuseRemapMin,
    ...layer.diffuseRemapMax,
    ...layer.maskRemapMin,
    ...layer.maskRemapMax,
    layer.metallic,
    layer.smoothness,
    layer.snowResponse,
    ...layer.specular
  ];
  if (finiteValues.some((value) => !Number.isFinite(value))) {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" has non-finite material semantics`);
  }
  if (layer.snowResponse < 0 || layer.snowResponse > 1) {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" snow response must be between 0 and 1`);
  }
  if (layerUsesDiffuseTexture(layer) && layer.diffuse === undefined) {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" requires a diffuse texture`);
  }
  if (layer.normalScale !== 0 && layer.normal === undefined) {
    invalidSource(`Terrain Region "${regionId}" layer "${layer.id}" requires a normal texture`);
  }
}

function layerUsesDiffuseTexture<TTexture>(layer: TerrainLayerResolvedSource<TTexture>): boolean {
  return layer.diffuseRemapMin.some((value, index) => value !== layer.diffuseRemapMax[index]);
}

function validateStableId(id: string, owner: string): void {
  if (!id) invalidSource(`${owner} id must not be empty`);
}

function validateDeviceLimit(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TerrainLayerResidencyError(
      TerrainLayerResidencyErrorCode.InvalidDeviceLimit,
      `Terrain layer residency requires a valid ${name} limit`
    );
  }
}

function invalidSource(message: string): never {
  throw new TerrainLayerResidencyError(TerrainLayerResidencyErrorCode.InvalidSource, message);
}

function encodeAlphamapId(regionId: string, index: number): string {
  return `${regionId.length}:${regionId}:${index.toString().padStart(4, "0")}`;
}
