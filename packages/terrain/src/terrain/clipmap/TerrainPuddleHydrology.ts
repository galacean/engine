import { packTerrainAtlasRectangles, type TerrainAtlasRectangle } from "./TerrainHeightAtlas";
import type { TerrainClipmapRegionSource } from "./TerrainClipmapSource";

/** Maximum spacing used by the shallow-puddle drainage compiler. */
export const TERRAIN_PUDDLE_HYDROLOGY_MAX_SPACING_METRES = 4;

/** Maximum temporary rainwater depth represented by Terrain before Water owns the body. */
export const TERRAIN_PUDDLE_MAX_DEPTH_METRES = 0.05;

/** Maximum shallow-water footprint retained as a puddle instead of a Water body. */
export const TERRAIN_PUDDLE_MAX_AREA_SQUARE_METRES = 10_000;

/** Minimum connected footprint retained after hydrology compilation. */
export const TERRAIN_PUDDLE_MIN_AREA_SQUARE_METRES = 12;

/** Default unresolved centimetre-scale relief, capped by Terrain's temporary shallow-water depth. */
export const TERRAIN_PUDDLE_MICRO_RELIEF_METRES = TERRAIN_PUDDLE_MAX_DEPTH_METRES;

/** Maximum downhill run spanned by one unresolved micro-catchment. */
export const TERRAIN_PUDDLE_MICRO_CATCHMENT_RUN_METRES = 0.2;

/** Normalized retained-water level at which the strongest unresolved micro-catchment starts filling. */
export const TERRAIN_PUDDLE_MICRO_CATCHMENT_FILL_THRESHOLD = 0.1;

/** R8 hydrology-class code for unresolved sub-grid retention. */
export const TERRAIN_PUDDLE_MICRO_CATCHMENT_CLASS = 128;

/** R8 hydrology-class code for a heightfield-resolved closed basin. */
export const TERRAIN_PUDDLE_RESOLVED_BASIN_CLASS = 255;

/** One packed shallow-water threshold Region. */
export interface TerrainPuddleHydrologyRegion extends TerrainAtlasRectangle {
  readonly worldPosition: readonly [x: number, y: number, z: number];
  readonly worldSize: readonly [x: number, y: number, z: number];
}

/** Authored shallow and standing water encoded in the existing RG8 atlas. */
export interface TerrainAuthoredPuddleCoverage {
  readonly basinCount: number;
  sample(
    worldX: number,
    worldZ: number
  ): { fillThreshold: number; depthClass: number; depthMetres: number } | undefined;
}

/** Optional drainage thresholds and authored coverage. */
export interface TerrainPuddleHydrologyOptions {
  readonly maximumSpacingMetres?: number;
  readonly authoredCoverage?: TerrainAuthoredPuddleCoverage;
  readonly maximumDepthMetres?: number;
  readonly minimumAreaSquareMetres?: number;
  readonly maximumAreaSquareMetres?: number;
  readonly unresolvedMicroReliefMetres?: number;
  /** Horizontal downhill run over which unresolved relief must retain water. */
  readonly microCatchmentRunMetres?: number;
  /** Raising this normalized threshold reduces the unresolved micro-catchment footprint. */
  readonly microCatchmentFillThreshold?: number;
}

/** Region-local lossless R16 height update consumed by the drainage compiler. */
export interface TerrainPuddleHydrologyHeightPatch {
  readonly regionId: string;
  readonly sampleOrigin: readonly [x: number, z: number];
  readonly sampleSize: readonly [width: number, height: number];
  readonly samples: Uint16Array;
}

/** Static drainage field sampled by Terrain rendering and rain-contact VFX. */
export class TerrainPuddleHydrologyField {
  /** Packed R8 fill threshold plus R8 hydrology-class pixels. */
  readonly pixels: Uint8Array;
  /** Packed atlas width. */
  readonly width: number;
  /** Packed atlas height. */
  readonly height: number;
  /** Region rectangles sharing the renderer's canonical world bounds. */
  readonly regions: readonly TerrainPuddleHydrologyRegion[];
  /** World-space drainage-grid spacing. */
  readonly spacingMetres: number;
  /** Number of retained resolved basins and unresolved micro-catchment groups. */
  readonly basinCount: number;
  /** Total retained shallow-water footprint at full storage. */
  readonly maximumPuddleAreaSquareMetres: number;
  /** Total shallow-water volume retained by the compiled drainage field. */
  readonly maximumPuddleVolumeCubicMetres: number;
  /** Plan area represented by the discrete drainage field. */
  readonly drainageAreaSquareMetres: number;
  /** Rainfall-equivalent depth required to fill every retained catchment. */
  readonly rainfallEquivalentCapacityMillimetres: number;

  constructor(
    width: number,
    height: number,
    pixels: Uint8Array,
    regions: readonly TerrainPuddleHydrologyRegion[],
    spacingMetres: number,
    basinCount: number,
    maximumPuddleAreaSquareMetres: number,
    maximumPuddleVolumeCubicMetres: number,
    drainageAreaSquareMetres: number,
    private readonly _feathered = false
  ) {
    this.width = width;
    this.height = height;
    this.pixels = pixels;
    this.regions = regions;
    this.spacingMetres = spacingMetres;
    this.basinCount = basinCount;
    this.maximumPuddleAreaSquareMetres = maximumPuddleAreaSquareMetres;
    this.maximumPuddleVolumeCubicMetres = maximumPuddleVolumeCubicMetres;
    this.drainageAreaSquareMetres = drainageAreaSquareMetres;
    this.rainfallEquivalentCapacityMillimetres =
      drainageAreaSquareMetres > 0 ? (maximumPuddleVolumeCubicMetres / drainageAreaSquareMetres) * 1000 : 0;
  }

  /**
   * Samples the same volume-normalized basin coverage consumed by the Terrain Shader.
   * @param worldX - World-space X coordinate
   * @param worldZ - World-space Z coordinate
   * @param storage - Normalized retained-water volume
   * @returns Fractional standing-water coverage, or zero outside a retained basin
   */
  sampleCoverage(worldX: number, worldZ: number, storage: number): number {
    const region = findHydrologyRegion(this.regions, worldX, worldZ);
    if (!region) return 0;
    const localX = clamp01((worldX - region.worldPosition[0]) / region.worldSize[0]) * (region.width - 1);
    const localZ = clamp01((worldZ - region.worldPosition[2]) / region.worldSize[2]) * (region.height - 1);
    const x0 = Math.floor(localX);
    const z0 = Math.floor(localZ);
    const x1 = Math.min(x0 + 1, region.width - 1);
    const z1 = Math.min(z0 + 1, region.height - 1);
    const blendX = localX - x0;
    const blendZ = localZ - z0;
    const threshold = bilinearChannel(this, region, x0, z0, x1, z1, blendX, blendZ, 0);
    const hydrologyClass = bilinearChannel(this, region, x0, z0, x1, z1, blendX, blendZ, 1);
    const waterStorage = clamp01(storage);
    if (this._feathered) {
      const retained = 0.42 * smoothstep(0, 0.39, hydrologyClass);
      const basin = smoothstep(0.4, 0.97, hydrologyClass);
      const fill = smoothstep(-0.09, 0.09, waterStorage - threshold) * smoothstep(0.06, 0.3, waterStorage);
      return (retained * (1 - basin) + basin) * fill;
    }
    const transition = 1 / 255;
    const retainedSurface = smoothstep(0.25, 0.45, hydrologyClass);
    return retainedSurface * smoothstep(-transition, transition, waterStorage - threshold);
  }
}

interface TerrainPuddleHydrologyGrid {
  readonly originX: number;
  readonly originZ: number;
  readonly spacing: number;
  readonly width: number;
  readonly height: number;
  readonly elevations: Float32Array;
  readonly valid: Uint8Array;
  readonly sourceMappings: readonly TerrainPuddleSourceMapping[];
}

interface TerrainPuddleSourceMapping {
  readonly source: TerrainClipmapRegionSource;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originZ: number;
  readonly stride: number;
}

interface ResolvedTerrainPuddleHydrologyOptions {
  readonly maximumSpacingMetres: number;
  readonly maximumDepthMetres: number;
  readonly minimumAreaSquareMetres: number;
  readonly maximumAreaSquareMetres: number;
  readonly unresolvedMicroReliefMetres: number;
  readonly microCatchmentRunMetres: number;
  readonly microCatchmentFillThreshold: number;
}

/**
 * Compiles resolved depressions plus centimetre-scale micro-catchments into a fill-threshold atlas.
 * @param sources - Active canonical Terrain Region height and holes payloads
 * @param maxTextureSize - Device texture dimension limit
 * @param options - Optional shallow-water compilation thresholds
 * @returns Drainage field whose runtime evaluation requires one filtered texture sample
 */
export function compileTerrainPuddleHydrology(
  sources: readonly TerrainClipmapRegionSource[],
  maxTextureSize: number,
  options: Readonly<TerrainPuddleHydrologyOptions> = {}
): TerrainPuddleHydrologyField {
  return new TerrainPuddleHydrologyCompiler(sources, maxTextureSize, options).compile();
}

/** Event-driven drainage compiler retaining only its coarse metric elevation grid. */
export class TerrainPuddleHydrologyCompiler {
  private readonly _options: ResolvedTerrainPuddleHydrologyOptions;
  private readonly _grid: TerrainPuddleHydrologyGrid;
  private readonly _authoredCoverage?: TerrainAuthoredPuddleCoverage;

  /**
   * Creates a reusable compiler for one active Terrain residency set.
   * @param sources - Active canonical Terrain Region height and holes payloads
   * @param maxTextureSize - Device texture dimension limit
   * @param options - Optional shallow-water compilation thresholds
   */
  constructor(
    sources: readonly TerrainClipmapRegionSource[],
    private readonly _maxTextureSize: number,
    options: Readonly<TerrainPuddleHydrologyOptions> = {}
  ) {
    if (!sources.length) throw new Error("Terrain puddle hydrology requires at least one active Region");
    this._options = resolveOptions(options);
    this._authoredCoverage = options.authoredCoverage;
    this._grid = createHydrologyGrid(sources, this._options.maximumSpacingMetres);
  }

  /** @returns A newly compiled static fill-threshold atlas. */
  compile(): TerrainPuddleHydrologyField {
    const coverage = this._authoredCoverage;
    if (coverage) {
      return compileAuthoredCoverage(this._grid, this._maxTextureSize, coverage);
    }
    const fillElevation = priorityFlood(this._grid, this._grid.elevations);
    const threshold = new Uint8Array(this._grid.width * this._grid.height);
    const hydrologyClass = new Uint8Array(this._grid.width * this._grid.height);
    const closedBasins = encodeClosedBasins(
      this._grid,
      this._grid.elevations,
      fillElevation,
      threshold,
      hydrologyClass,
      this._options
    );
    const microCatchments = encodeUnresolvedMicroCatchments(this._grid, threshold, hydrologyClass, this._options);
    const result = {
      basinCount: closedBasins.basinCount + microCatchments.catchmentCount,
      maximumPuddleAreaSquareMetres:
        closedBasins.maximumPuddleAreaSquareMetres + microCatchments.maximumPuddleAreaSquareMetres,
      maximumPuddleVolumeCubicMetres:
        closedBasins.maximumPuddleVolumeCubicMetres + microCatchments.maximumPuddleVolumeCubicMetres
    };
    return packHydrologyField(this._grid, threshold, hydrologyClass, this._maxTextureSize, result);
  }

  /**
   * Applies height edits to the retained coarse grid and recompiles drainage once.
   * @param patches - Region-local lossless R16 rectangles
   * @returns Updated static fill-threshold atlas
   */
  updateHeightRegions(patches: readonly TerrainPuddleHydrologyHeightPatch[]): TerrainPuddleHydrologyField {
    const mappings = new Map(this._grid.sourceMappings.map((mapping) => [mapping.source.id, mapping] as const));
    for (const patch of patches) {
      const mapping = mappings.get(patch.regionId);
      if (!mapping) throw new Error(`Terrain puddle hydrology does not contain active Region "${patch.regionId}"`);
      applyHeightPatch(this._grid, mapping, patch);
    }
    return this.compile();
  }
}

function resolveOptions(options: Readonly<TerrainPuddleHydrologyOptions>): ResolvedTerrainPuddleHydrologyOptions {
  const resolved = {
    maximumSpacingMetres: options.maximumSpacingMetres ?? TERRAIN_PUDDLE_HYDROLOGY_MAX_SPACING_METRES,
    maximumDepthMetres: options.maximumDepthMetres ?? TERRAIN_PUDDLE_MAX_DEPTH_METRES,
    minimumAreaSquareMetres: options.minimumAreaSquareMetres ?? TERRAIN_PUDDLE_MIN_AREA_SQUARE_METRES,
    maximumAreaSquareMetres: options.maximumAreaSquareMetres ?? TERRAIN_PUDDLE_MAX_AREA_SQUARE_METRES,
    unresolvedMicroReliefMetres: options.unresolvedMicroReliefMetres ?? TERRAIN_PUDDLE_MICRO_RELIEF_METRES,
    microCatchmentRunMetres: options.microCatchmentRunMetres ?? TERRAIN_PUDDLE_MICRO_CATCHMENT_RUN_METRES,
    microCatchmentFillThreshold: options.microCatchmentFillThreshold ?? TERRAIN_PUDDLE_MICRO_CATCHMENT_FILL_THRESHOLD
  };
  if (
    !Number.isFinite(resolved.maximumSpacingMetres) ||
    !Number.isFinite(resolved.maximumDepthMetres) ||
    !Number.isFinite(resolved.minimumAreaSquareMetres) ||
    !Number.isFinite(resolved.maximumAreaSquareMetres) ||
    !Number.isFinite(resolved.unresolvedMicroReliefMetres) ||
    !Number.isFinite(resolved.microCatchmentRunMetres) ||
    resolved.maximumSpacingMetres <= 0 ||
    resolved.maximumDepthMetres <= 0 ||
    resolved.minimumAreaSquareMetres <= 0 ||
    resolved.maximumAreaSquareMetres < resolved.minimumAreaSquareMetres ||
    resolved.unresolvedMicroReliefMetres < 0 ||
    resolved.microCatchmentRunMetres <= 0 ||
    resolved.microCatchmentFillThreshold < 0 ||
    resolved.microCatchmentFillThreshold > 1
  ) {
    throw new RangeError("Terrain puddle hydrology options must define finite metric limits and normalized thresholds");
  }
  return resolved;
}

function createHydrologyGrid(
  sources: readonly TerrainClipmapRegionSource[],
  maximumSpacingMetres: number
): TerrainPuddleHydrologyGrid {
  const first = sources[0];
  const nativeSpacing = sourceSpacing(first);
  const maximumStride = Math.max(1, Math.floor(maximumSpacingMetres / nativeSpacing));
  const stride = selectCompatibleStride(sources, first, nativeSpacing, maximumStride);
  const spacing = nativeSpacing * stride;
  const originX = Math.min(...sources.map((source) => source.worldPosition[0]));
  const originZ = Math.min(...sources.map((source) => source.worldPosition[2]));
  const maximumX = Math.max(...sources.map((source) => source.worldPosition[0] + source.worldSize[0]));
  const maximumZ = Math.max(...sources.map((source) => source.worldPosition[2] + source.worldSize[2]));
  const width = Math.round((maximumX - originX) / spacing) + 1;
  const height = Math.round((maximumZ - originZ) / spacing) + 1;
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount) || cellCount > 4_194_304) {
    throw new Error(`Terrain puddle hydrology grid ${width}x${height} exceeds the current compiler capacity`);
  }
  const elevations = new Float32Array(cellCount);
  const valid = new Uint8Array(cellCount);
  const sourceMappings: TerrainPuddleSourceMapping[] = [];
  for (const source of sources) {
    const [sourceWidth, sourceHeight] = source.heightSampleSize;
    const coarseWidth = (sourceWidth - 1) / stride + 1;
    const coarseHeight = (sourceHeight - 1) / stride + 1;
    const gridOriginX = Math.round((source.worldPosition[0] - originX) / spacing);
    const gridOriginZ = Math.round((source.worldPosition[2] - originZ) / spacing);
    sourceMappings.push({
      source,
      width: coarseWidth,
      height: coarseHeight,
      originX: gridOriginX,
      originZ: gridOriginZ,
      stride
    });
    for (let localZ = 0; localZ < coarseHeight; localZ++) {
      const sourceZ = localZ * stride;
      for (let localX = 0; localX < coarseWidth; localX++) {
        const sourceX = localX * stride;
        if (!isHeightSampleSolid(source, sourceX, sourceZ)) continue;
        const globalIndex = (gridOriginZ + localZ) * width + gridOriginX + localX;
        const sample = source.heightSamples[sourceZ * sourceWidth + sourceX];
        const elevation = source.heightDecodeOffset + (sample / 65535) * source.heightDecodeScale;
        if (valid[globalIndex] && Math.abs(elevations[globalIndex] - elevation) > 0.02) {
          throw new Error(`Terrain puddle hydrology Region seam differs at ${source.id}`);
        }
        elevations[globalIndex] = elevation;
        valid[globalIndex] = 1;
      }
    }
  }
  return { originX, originZ, spacing, width, height, elevations, valid, sourceMappings };
}

function applyHeightPatch(
  grid: TerrainPuddleHydrologyGrid,
  mapping: TerrainPuddleSourceMapping,
  patch: TerrainPuddleHydrologyHeightPatch
): void {
  const [patchX, patchZ] = patch.sampleOrigin;
  const [patchWidth, patchHeight] = patch.sampleSize;
  const minimumCoarseX = Math.ceil(patchX / mapping.stride);
  const maximumCoarseX = Math.floor((patchX + patchWidth - 1) / mapping.stride);
  const minimumCoarseZ = Math.ceil(patchZ / mapping.stride);
  const maximumCoarseZ = Math.floor((patchZ + patchHeight - 1) / mapping.stride);
  for (let coarseZ = minimumCoarseZ; coarseZ <= maximumCoarseZ; coarseZ++) {
    const sourceZ = coarseZ * mapping.stride;
    for (let coarseX = minimumCoarseX; coarseX <= maximumCoarseX; coarseX++) {
      const sourceX = coarseX * mapping.stride;
      const patchIndex = (sourceZ - patchZ) * patchWidth + sourceX - patchX;
      const sample = patch.samples[patchIndex];
      const globalIndex = (mapping.originZ + coarseZ) * grid.width + mapping.originX + coarseX;
      grid.elevations[globalIndex] =
        mapping.source.heightDecodeOffset + (sample / 65535) * mapping.source.heightDecodeScale;
    }
  }
}

function selectCompatibleStride(
  sources: readonly TerrainClipmapRegionSource[],
  first: TerrainClipmapRegionSource,
  nativeSpacing: number,
  maximumStride: number
): number {
  for (let stride = maximumStride; stride >= 1; stride--) {
    let compatible = true;
    for (const source of sources) {
      const [width, height] = source.heightSampleSize;
      const spacing = sourceSpacing(source);
      const offsetX = (source.worldPosition[0] - first.worldPosition[0]) / nativeSpacing;
      const offsetZ = (source.worldPosition[2] - first.worldPosition[2]) / nativeSpacing;
      if (
        !nearlyEqual(spacing, nativeSpacing) ||
        (width - 1) % stride !== 0 ||
        (height - 1) % stride !== 0 ||
        !nearlyInteger(offsetX / stride) ||
        !nearlyInteger(offsetZ / stride)
      ) {
        compatible = false;
        break;
      }
    }
    if (compatible) return stride;
  }
  throw new Error("Terrain puddle hydrology requires one aligned isotropic height grid");
}

function sourceSpacing(source: TerrainClipmapRegionSource): number {
  const [width, height] = source.heightSampleSize;
  const spacingX = source.worldSize[0] / (width - 1);
  const spacingZ = source.worldSize[2] / (height - 1);
  if (!nearlyEqual(spacingX, spacingZ)) {
    throw new Error(`Terrain puddle hydrology Region "${source.id}" has anisotropic height spacing`);
  }
  return spacingX;
}

function isHeightSampleSolid(source: TerrainClipmapRegionSource, sampleX: number, sampleZ: number): boolean {
  if (!source.holesSampleSize || source.holesSolidValue === undefined || !source.holes) return true;
  const [heightWidth, heightHeight] = source.heightSampleSize;
  const [holesWidth, holesHeight] = source.holesSampleSize;
  const normalizedX = sampleX / Math.max(heightWidth - 1, 1);
  const normalizedZ = sampleZ / Math.max(heightHeight - 1, 1);
  const holesX = Math.min(Math.floor(normalizedX * holesWidth), holesWidth - 1);
  const holesZ = Math.min(Math.floor(normalizedZ * holesHeight), holesHeight - 1);
  return source.holes[holesZ * holesWidth + holesX] === source.holesSolidValue;
}

function terrainPuddleValueNoise(x: number, z: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = x - cellX;
  const localZ = z - cellZ;
  const blendX = localX * localX * (3 - 2 * localX);
  const blendZ = localZ * localZ * (3 - 2 * localZ);
  const lower = mix(terrainPuddleHash(cellX, cellZ), terrainPuddleHash(cellX + 1, cellZ), blendX);
  const upper = mix(terrainPuddleHash(cellX, cellZ + 1), terrainPuddleHash(cellX + 1, cellZ + 1), blendX);
  return mix(lower, upper, blendZ);
}

function terrainPuddleHash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function priorityFlood(grid: TerrainPuddleHydrologyGrid, elevations: Float32Array): Float32Array {
  const { width, height, valid } = grid;
  const fillElevation = new Float32Array(elevations.length);
  fillElevation.fill(Number.POSITIVE_INFINITY);
  const queued = new Uint8Array(elevations.length);
  const heap = new TerrainPuddleMinHeap(fillElevation, elevations.length);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      if (!valid[index] || !isDrainBoundary(valid, width, height, x, z)) continue;
      fillElevation[index] = elevations[index];
      queued[index] = 1;
      heap.push(index);
    }
  }
  while (heap.size > 0) {
    const current = heap.pop();
    const currentX = current % width;
    const currentZ = Math.floor(current / width);
    visitNeighbors(width, height, currentX, currentZ, (neighbor) => {
      if (!valid[neighbor] || queued[neighbor]) return;
      queued[neighbor] = 1;
      fillElevation[neighbor] = Math.max(elevations[neighbor], fillElevation[current]);
      heap.push(neighbor);
    });
  }
  return fillElevation;
}

function isDrainBoundary(valid: Uint8Array, width: number, height: number, x: number, z: number): boolean {
  if (x === 0 || z === 0 || x === width - 1 || z === height - 1) return true;
  let drain = false;
  visitNeighbors(width, height, x, z, (neighbor) => {
    if (!valid[neighbor]) drain = true;
  });
  return drain;
}

function encodeClosedBasins(
  grid: TerrainPuddleHydrologyGrid,
  elevations: Float32Array,
  fillElevation: Float32Array,
  threshold: Uint8Array,
  hydrologyClass: Uint8Array,
  options: ResolvedTerrainPuddleHydrologyOptions
): { basinCount: number; maximumPuddleAreaSquareMetres: number; maximumPuddleVolumeCubicMetres: number } {
  const { width, height, valid, spacing } = grid;
  const visited = new Uint8Array(elevations.length);
  const queue = new Int32Array(elevations.length);
  const cellArea = spacing * spacing;
  const minimumDepth = Math.max(0.012, spacing * 0.0005);
  let basinCount = 0;
  let maximumPuddleAreaSquareMetres = 0;
  let maximumPuddleVolumeCubicMetres = 0;
  for (let start = 0; start < elevations.length; start++) {
    if (visited[start] || !valid[start] || fillElevation[start] - elevations[start] <= minimumDepth) continue;
    const spillElevation = fillElevation[start];
    const basinCells: number[] = [];
    let queueStart = 0;
    let queueEnd = 0;
    queue[queueEnd++] = start;
    visited[start] = 1;
    while (queueStart < queueEnd) {
      const index = queue[queueStart++];
      basinCells.push(index);
      const x = index % width;
      const z = Math.floor(index / width);
      visitNeighbors(width, height, x, z, (neighbor) => {
        if (
          visited[neighbor] ||
          !valid[neighbor] ||
          fillElevation[neighbor] - elevations[neighbor] <= minimumDepth ||
          Math.abs(fillElevation[neighbor] - spillElevation) > 0.001
        ) {
          return;
        }
        visited[neighbor] = 1;
        queue[queueEnd++] = neighbor;
      });
    }
    const minimumElevation = basinCells.reduce(
      (minimum, index) => Math.min(minimum, elevations[index]),
      Number.POSITIVE_INFINITY
    );
    const waterCap = Math.min(spillElevation, minimumElevation + options.maximumDepthMetres);
    const shallowCells = basinCells.filter((index) => elevations[index] < waterCap - minimumDepth * 0.5);
    const shallowArea = shallowCells.length * cellArea;
    if (shallowArea < options.minimumAreaSquareMetres || shallowArea > options.maximumAreaSquareMetres) continue;
    const maximumVolume = shallowCells.reduce((volume, index) => volume + (waterCap - elevations[index]) * cellArea, 0);
    if (maximumVolume <= minimumDepth * cellArea) continue;
    encodeBasinThresholds(shallowCells, elevations, cellArea, maximumVolume, threshold, hydrologyClass);
    basinCount++;
    maximumPuddleAreaSquareMetres += shallowArea;
    maximumPuddleVolumeCubicMetres += maximumVolume;
  }
  return { basinCount, maximumPuddleAreaSquareMetres, maximumPuddleVolumeCubicMetres };
}

function encodeUnresolvedMicroCatchments(
  grid: TerrainPuddleHydrologyGrid,
  threshold: Uint8Array,
  hydrologyClass: Uint8Array,
  options: ResolvedTerrainPuddleHydrologyOptions
): { catchmentCount: number; maximumPuddleAreaSquareMetres: number; maximumPuddleVolumeCubicMetres: number } {
  const {
    unresolvedMicroReliefMetres: microReliefMetres,
    microCatchmentRunMetres,
    microCatchmentFillThreshold
  } = options;
  if (microReliefMetres <= 0) {
    return { catchmentCount: 0, maximumPuddleAreaSquareMetres: 0, maximumPuddleVolumeCubicMetres: 0 };
  }
  const { originX, originZ, spacing, width, height, elevations, valid } = grid;
  const microMask = new Uint8Array(elevations.length);
  const amplitude = clamp01(microReliefMetres / TERRAIN_PUDDLE_MICRO_RELIEF_METRES);
  const cellArea = spacing * spacing;
  let maximumPuddleAreaSquareMetres = 0;
  let maximumPuddleVolumeCubicMetres = 0;
  for (let z = 1; z < height - 1; z++) {
    const worldZ = originZ + z * spacing;
    for (let x = 1; x < width - 1; x++) {
      const index = z * width + x;
      if (!valid[index] || hydrologyClass[index]) continue;
      const left = index - 1;
      const right = index + 1;
      const back = index - width;
      const front = index + width;
      if (!valid[left] || !valid[right] || !valid[back] || !valid[front]) continue;
      const slopeX = (elevations[right] - elevations[left]) / (spacing * 2);
      const slopeZ = (elevations[front] - elevations[back]) / (spacing * 2);
      const downhillRun = Math.min(spacing, microCatchmentRunMetres);
      const downhillDrop = Math.hypot(slopeX, slopeZ) * downhillRun;
      // Unresolved relief can close a sub-grid basin only while it exceeds the
      // macro surface's downhill fall; steeper surfaces retain a wet film instead
      const slopeStorage = 1 - smoothstep(microReliefMetres * 0.25, microReliefMetres, downhillDrop);
      if (slopeStorage <= 0.02) continue;
      const neighborMean = (elevations[left] + elevations[right] + elevations[back] + elevations[front]) * 0.25;
      const convergence = smoothstep(-0.08, 0.12, neighborMean - elevations[index]);
      const worldX = originX + x * spacing;
      const broad = terrainPuddleValueNoise(worldX * 0.041, worldZ * 0.041);
      const detail = terrainPuddleValueNoise(worldX * 0.113 + 19.7, worldZ * 0.113 + 43.1);
      const microDepression = mix(broad, detail, 0.34);
      const susceptibility = Math.pow(slopeStorage * mix(microDepression, convergence, 0.18) * amplitude, 1.3);
      const storageThreshold = mix(microCatchmentFillThreshold, 1.04, 1 - susceptibility);
      if (storageThreshold >= 1) continue;
      threshold[index] = Math.min(255, Math.max(1, Math.round(storageThreshold * 254) + 1));
      hydrologyClass[index] = TERRAIN_PUDDLE_MICRO_CATCHMENT_CLASS;
      microMask[index] = 1;
      maximumPuddleAreaSquareMetres += cellArea;
      const retentionFraction = clamp01(
        (1 - storageThreshold) / Math.max(1 - microCatchmentFillThreshold, Number.EPSILON)
      );
      // Sub-grid depressions use a triangular depth profile whose maximum relief is authored in metres
      maximumPuddleVolumeCubicMetres += microReliefMetres * 0.5 * retentionFraction * cellArea;
    }
  }
  return {
    catchmentCount: countConnectedCatchments(microMask, valid, width, height),
    maximumPuddleAreaSquareMetres,
    maximumPuddleVolumeCubicMetres
  };
}

function countConnectedCatchments(mask: Uint8Array, valid: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let catchmentCount = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let queueStart = 0;
    let queueEnd = 0;
    visited[start] = 1;
    queue[queueEnd++] = start;
    while (queueStart < queueEnd) {
      const index = queue[queueStart++];
      const x = index % width;
      const z = Math.floor(index / width);
      visitNeighbors(width, height, x, z, (neighbor) => {
        if (!valid[neighbor] || !mask[neighbor] || visited[neighbor]) return;
        visited[neighbor] = 1;
        queue[queueEnd++] = neighbor;
      });
    }
    catchmentCount++;
  }
  return catchmentCount;
}

function encodeBasinThresholds(
  cells: number[],
  elevations: Float32Array,
  cellArea: number,
  maximumVolume: number,
  threshold: Uint8Array,
  hydrologyClass: Uint8Array
): void {
  cells.sort((left, right) => elevations[left] - elevations[right] || left - right);
  let activeCells = 0;
  let volume = 0;
  let currentElevation = elevations[cells[0]];
  let cursor = 0;
  while (cursor < cells.length) {
    const groupElevation = elevations[cells[cursor]];
    volume += (groupElevation - currentElevation) * activeCells * cellArea;
    let groupEnd = cursor + 1;
    while (groupEnd < cells.length && elevations[cells[groupEnd]] === groupElevation) groupEnd++;
    const normalizedThreshold = clamp01(volume / maximumVolume);
    const encodedThreshold = Math.min(255, Math.max(1, Math.round(normalizedThreshold * 254) + 1));
    for (let index = cursor; index < groupEnd; index++) {
      threshold[cells[index]] = encodedThreshold;
      hydrologyClass[cells[index]] = TERRAIN_PUDDLE_RESOLVED_BASIN_CLASS;
    }
    activeCells += groupEnd - cursor;
    currentElevation = groupElevation;
    cursor = groupEnd;
  }
}

function compileAuthoredCoverage(
  grid: TerrainPuddleHydrologyGrid,
  maxTextureSize: number,
  coverage: TerrainAuthoredPuddleCoverage
): TerrainPuddleHydrologyField {
  const threshold = new Uint8Array(grid.valid.length);
  threshold.fill(Math.round(0.72 * 255));
  const depthClass = new Uint8Array(grid.valid.length);
  const cellArea = grid.spacing ** 2;
  let footprint = 0;
  let volume = 0;
  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const index = z * grid.width + x;
      if (!grid.valid[index]) continue;
      const sample = coverage.sample(grid.originX + x * grid.spacing, grid.originZ + z * grid.spacing);
      if (!sample) continue;
      threshold[index] = Math.round(clamp01(sample.fillThreshold) * 255);
      depthClass[index] = Math.round(clamp01(sample.depthClass) * 255);
      footprint += cellArea;
      volume += sample.depthMetres * cellArea;
    }
  }
  return packHydrologyField(
    grid,
    threshold,
    depthClass,
    maxTextureSize,
    {
      basinCount: coverage.basinCount,
      maximumPuddleAreaSquareMetres: footprint,
      maximumPuddleVolumeCubicMetres: volume
    },
    true
  );
}

function packHydrologyField(
  grid: TerrainPuddleHydrologyGrid,
  threshold: Uint8Array,
  hydrologyClass: Uint8Array,
  maxTextureSize: number,
  result: {
    basinCount: number;
    maximumPuddleAreaSquareMetres: number;
    maximumPuddleVolumeCubicMetres: number;
  },
  feathered = false
): TerrainPuddleHydrologyField {
  const layout = packTerrainAtlasRectangles(
    grid.sourceMappings.map((mapping) => ({ id: mapping.source.id, width: mapping.width, height: mapping.height })),
    maxTextureSize
  );
  const mappingById = new Map(grid.sourceMappings.map((mapping) => [mapping.source.id, mapping] as const));
  const pixels = new Uint8Array(layout.width * layout.height * 2);
  const regions = layout.rectangles.map((rectangle): TerrainPuddleHydrologyRegion => {
    const mapping = mappingById.get(rectangle.id)!;
    for (let localZ = 0; localZ < mapping.height; localZ++) {
      for (let localX = 0; localX < mapping.width; localX++) {
        const globalIndex = (mapping.originZ + localZ) * grid.width + mapping.originX + localX;
        const atlasIndex = ((rectangle.y + localZ) * layout.width + rectangle.x + localX) * 2;
        pixels[atlasIndex] = threshold[globalIndex];
        pixels[atlasIndex + 1] = hydrologyClass[globalIndex];
      }
    }
    return {
      ...rectangle,
      worldPosition: [...mapping.source.worldPosition],
      worldSize: [...mapping.source.worldSize]
    };
  });
  return new TerrainPuddleHydrologyField(
    layout.width,
    layout.height,
    pixels,
    regions,
    grid.spacing,
    result.basinCount,
    result.maximumPuddleAreaSquareMetres,
    result.maximumPuddleVolumeCubicMetres,
    countValidDrainageArea(grid),
    feathered
  );
}

function countValidDrainageArea(grid: TerrainPuddleHydrologyGrid): number {
  let validCellCount = 0;
  for (const sample of grid.valid) {
    validCellCount += sample;
  }
  return validCellCount * grid.spacing * grid.spacing;
}

function findHydrologyRegion(
  regions: readonly TerrainPuddleHydrologyRegion[],
  worldX: number,
  worldZ: number
): TerrainPuddleHydrologyRegion | undefined {
  let boundaryCandidate: TerrainPuddleHydrologyRegion | undefined;
  for (const region of regions) {
    const minimumX = region.worldPosition[0];
    const minimumZ = region.worldPosition[2];
    const maximumX = minimumX + region.worldSize[0];
    const maximumZ = minimumZ + region.worldSize[2];
    if (worldX < minimumX || worldX > maximumX || worldZ < minimumZ || worldZ > maximumZ) continue;
    if (worldX < maximumX && worldZ < maximumZ) return region;
    if (
      !boundaryCandidate ||
      minimumX > boundaryCandidate.worldPosition[0] ||
      (minimumX === boundaryCandidate.worldPosition[0] && minimumZ > boundaryCandidate.worldPosition[2])
    ) {
      boundaryCandidate = region;
    }
  }
  return boundaryCandidate;
}

function bilinearChannel(
  field: TerrainPuddleHydrologyField,
  region: TerrainPuddleHydrologyRegion,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  blendX: number,
  blendZ: number,
  channel: 0 | 1
): number {
  const value00 = hydrologyChannel(field, region, x0, z0, channel);
  const value10 = hydrologyChannel(field, region, x1, z0, channel);
  const value01 = hydrologyChannel(field, region, x0, z1, channel);
  const value11 = hydrologyChannel(field, region, x1, z1, channel);
  return mix(mix(value00, value10, blendX), mix(value01, value11, blendX), blendZ);
}

function hydrologyChannel(
  field: TerrainPuddleHydrologyField,
  region: TerrainPuddleHydrologyRegion,
  localX: number,
  localZ: number,
  channel: 0 | 1
): number {
  const atlasIndex = ((region.y + localZ) * field.width + region.x + localX) * 2 + channel;
  return field.pixels[atlasIndex] / 255;
}

function visitNeighbors(width: number, height: number, x: number, z: number, visitor: (index: number) => void): void {
  const minimumX = Math.max(0, x - 1);
  const maximumX = Math.min(width - 1, x + 1);
  const minimumZ = Math.max(0, z - 1);
  const maximumZ = Math.min(height - 1, z + 1);
  for (let neighborZ = minimumZ; neighborZ <= maximumZ; neighborZ++) {
    for (let neighborX = minimumX; neighborX <= maximumX; neighborX++) {
      if (neighborX === x && neighborZ === z) continue;
      visitor(neighborZ * width + neighborX);
    }
  }
}

class TerrainPuddleMinHeap {
  private readonly _indices: Int32Array;
  private _size = 0;

  get size(): number {
    return this._size;
  }

  constructor(
    private readonly _priorities: Float32Array,
    capacity: number
  ) {
    this._indices = new Int32Array(capacity);
  }

  push(index: number): void {
    let cursor = this._size++;
    while (cursor > 0) {
      const parent = (cursor - 1) >> 1;
      const parentIndex = this._indices[parent];
      if (!this._less(index, parentIndex)) break;
      this._indices[cursor] = parentIndex;
      cursor = parent;
    }
    this._indices[cursor] = index;
  }

  pop(): number {
    const root = this._indices[0];
    const replacement = this._indices[--this._size];
    if (this._size > 0) {
      let cursor = 0;
      while (true) {
        const left = cursor * 2 + 1;
        if (left >= this._size) break;
        const right = left + 1;
        let child = left;
        if (right < this._size && this._less(this._indices[right], this._indices[left])) child = right;
        if (!this._less(this._indices[child], replacement)) break;
        this._indices[cursor] = this._indices[child];
        cursor = child;
      }
      this._indices[cursor] = replacement;
    }
    return root;
  }

  private _less(left: number, right: number): boolean {
    const priorityDifference = this._priorities[left] - this._priorities[right];
    return priorityDifference < 0 || (priorityDifference === 0 && left < right);
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 32 * Math.max(1, Math.abs(left), Math.abs(right));
}

function nearlyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= 1e-6;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}
