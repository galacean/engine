import { compareTerrainStableValues } from "../TerrainStableOrder";

/** Renderer-facing lossless Region height source independent of Project serialization. */
export interface TerrainClipmapHeightSource {
  readonly id: string;
  readonly worldPosition: readonly [x: number, y: number, z: number];
  readonly worldSize: readonly [x: number, y: number, z: number];
  readonly heightSampleSize: readonly [width: number, height: number];
  readonly heightDecodeOffset: number;
  readonly heightDecodeScale: number;
  readonly heightSamples: Uint16Array;
  /** Canonical Float32 geometry; supplied by fixed-surface producers without changing the R16 material atlas. */
  readonly surfaceHeights?: Float32Array;
}

/** Maximum Region count in one WebGL2 Geometry Clipmap residency set. */
export const TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS = 32;

/** Maximum rectangle count covered by the complete deterministic packing fallback. */
export const TERRAIN_ATLAS_EXACT_PACKING_LIMIT = 12;

/** Stable failure codes exposed by deterministic Terrain atlas packing. */
export const TerrainAtlasErrorCode = {
  InvalidDeviceLimit: "invalid-device-limit",
  InvalidSource: "invalid-source",
  OverlappingRegions: "overlapping-regions",
  ActiveRegionLimit: "capability-active-region-limit",
  TextureSizeLimit: "capability-texture-size-limit",
  AtlasCapacity: "capability-atlas-capacity",
  AtlasSearchIncomplete: "capability-atlas-search-incomplete"
} as const;

/** Stable failure code emitted by {@link TerrainAtlasError}. */
export type TerrainAtlasErrorCode = (typeof TerrainAtlasErrorCode)[keyof typeof TerrainAtlasErrorCode];

/** Error raised when Terrain atlas input is invalid or exceeds renderer capability. */
export class TerrainAtlasError extends Error {
  /**
   * Creates one classifiable Terrain atlas failure.
   * @param code Stable machine-readable failure code.
   * @param message Human-readable failure detail.
   */
  constructor(
    readonly code: TerrainAtlasErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TerrainAtlasError";
  }
}

/**
 * Compares opaque Terrain ids by fixed UTF-16 code units without locale-dependent collation.
 * @param left First stable id.
 * @param right Second stable id.
 * @returns Negative, zero, or positive according to deterministic code-unit order.
 */
export function compareTerrainStableIds(left: string, right: string): number {
  return compareTerrainStableValues(left, right);
}

/** Stable identity and dimensions of one rectangle submitted to Terrain atlas packing. */
export interface TerrainAtlasRectangleInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/** Deterministic pixel placement of one rectangle inside a Terrain atlas. */
export interface TerrainAtlasRectangle extends TerrainAtlasRectangleInput {
  readonly x: number;
  readonly y: number;
}

/** Reusable deterministic rectangle layout shared by renderer-owned Terrain atlases. */
export interface TerrainAtlasRectanglePacking {
  readonly width: number;
  readonly height: number;
  readonly rectangles: readonly TerrainAtlasRectangle[];
}

/** Atlas rectangle assigned to one stable Region id. */
export interface TerrainHeightAtlasRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly worldPosition: readonly [x: number, y: number, z: number];
  readonly worldSize: readonly [x: number, y: number, z: number];
  readonly heightDecodeOffset: number;
  readonly heightDecodeScale: number;
}

/** Exact two-byte height atlas built from a loaded renderer residency set. */
export interface TerrainHeightAtlasPacking {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly regions: readonly TerrainHeightAtlasRegion[];
}

/**
 * Packs variable-size R16 sources without changing samples or canonical Region identity.
 * @param sources Loaded renderer-neutral height sources.
 * @param maxTextureSize Device texture dimension limit.
 * @returns Deterministic low/high-byte atlas ordered by stable Region id.
 * @throws If the residency set exceeds the current Clipmap capability.
 */
export function packTerrainHeightAtlas(
  sources: readonly TerrainClipmapHeightSource[],
  maxTextureSize: number
): TerrainHeightAtlasPacking {
  validateMaxTextureSize(maxTextureSize);
  if (!sources.length) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.InvalidSource,
      "Geometry Clipmap height residency requires at least one Region"
    );
  }
  if (sources.length > TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.ActiveRegionLimit,
      `Geometry Clipmap supports at most ${TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS} active Regions; received ${sources.length}`
    );
  }

  const byId = [...sources].sort((left, right) => compareTerrainStableIds(left.id, right.id));
  for (let index = 0; index < byId.length; index++) {
    const source = byId[index];
    if (index > 0 && source.id === byId[index - 1].id) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap height residency contains duplicate Region id "${source.id}"`
      );
    }
    const [width, height] = source.heightSampleSize;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" has an invalid height sample size`
      );
    }
    if (source.heightSamples.length !== width * height) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" height payload size does not match its sample size`
      );
    }
    if (
      source.worldPosition.some((value) => !Number.isFinite(value)) ||
      source.worldSize.some((value) => !Number.isFinite(value) || value <= 0) ||
      !Number.isFinite(source.heightDecodeOffset) ||
      !Number.isFinite(source.heightDecodeScale) ||
      source.heightDecodeScale <= 0
    ) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" has invalid world or height decode values`
      );
    }
    if (width > maxTextureSize || height > maxTextureSize) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.TextureSizeLimit,
        `Geometry Clipmap Region "${source.id}" height ${width}x${height} exceeds device limit ${maxTextureSize}`
      );
    }
  }
  rejectPositiveAreaOverlap(byId);

  const layout = packTerrainAtlasRectangles(
    byId.map((source) => ({
      id: source.id,
      width: source.heightSampleSize[0],
      height: source.heightSampleSize[1]
    })),
    maxTextureSize
  );

  const sourceById = new Map(byId.map((source) => [source.id, source]));
  const pixels = new Uint8Array(layout.width * layout.height * 2);
  for (const region of layout.rectangles) {
    const source = sourceById.get(region.id)!;
    for (let localY = 0; localY < region.height; localY++) {
      for (let localX = 0; localX < region.width; localX++) {
        const sample = source.heightSamples[localY * region.width + localX];
        const atlasOffset = ((region.y + localY) * layout.width + region.x + localX) * 2;
        pixels[atlasOffset] = sample & 0xff;
        pixels[atlasOffset + 1] = sample >>> 8;
      }
    }
  }
  return {
    width: layout.width,
    height: layout.height,
    pixels,
    regions: layout.rectangles.map((region): TerrainHeightAtlasRegion => {
      const source = sourceById.get(region.id)!;
      return {
        ...region,
        worldPosition: [...source.worldPosition],
        worldSize: [...source.worldSize],
        heightDecodeOffset: source.heightDecodeOffset,
        heightDecodeScale: source.heightDecodeScale
      };
    })
  };
}

/**
 * Packs fixed-orientation rectangles into one bounded Terrain atlas.
 * @param rectangles Stable ids and exact pixel dimensions to pack.
 * @param maxTextureSize Maximum atlas width and height supported by the renderer.
 * @returns Deterministic placements ordered by UTF-16 code-unit id.
 * @throws {@link TerrainAtlasError} when input is invalid or cannot fit the renderer limit.
 */
export function packTerrainAtlasRectangles(
  rectangles: readonly TerrainAtlasRectangleInput[],
  maxTextureSize: number
): TerrainAtlasRectanglePacking {
  validateMaxTextureSize(maxTextureSize);
  if (!rectangles.length) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.InvalidSource,
      "Terrain atlas packing requires at least one rectangle"
    );
  }

  const byId = [...rectangles].sort((left, right) => compareTerrainStableIds(left.id, right.id));
  for (let index = 0; index < byId.length; index++) {
    const rectangle = byId[index];
    if (index > 0 && rectangle.id === byId[index - 1].id) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Terrain atlas packing contains duplicate rectangle id "${rectangle.id}"`
      );
    }
    if (
      !Number.isInteger(rectangle.width) ||
      !Number.isInteger(rectangle.height) ||
      rectangle.width < 1 ||
      rectangle.height < 1
    ) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Terrain atlas rectangle "${rectangle.id}" has invalid dimensions`
      );
    }
    if (rectangle.width > maxTextureSize || rectangle.height > maxTextureSize) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.TextureSizeLimit,
        `Terrain atlas rectangle "${rectangle.id}" ${rectangle.width}x${rectangle.height} exceeds device limit ${maxTextureSize}`
      );
    }
  }

  const placementOrder = [...byId].sort(
    (left, right) =>
      right.height - left.height || right.width - left.width || compareTerrainStableIds(left.id, right.id)
  );
  const minimumWidth = Math.max(...placementOrder.map((rectangle) => rectangle.width));
  const candidateWidths: number[] = [];
  for (let width = nextPowerOfTwo(minimumWidth); width < maxTextureSize; width *= 2) {
    candidateWidths.push(width);
  }
  candidateWidths.push(maxTextureSize);

  let best: readonly TerrainAtlasRectangle[] | undefined;
  let bestWidth = 0;
  let bestHeight = 0;
  for (const width of new Set(candidateWidths)) {
    const packed = packMaxRectangles(placementOrder, width, maxTextureSize);
    if (!packed) continue;
    const height = packed.reduce((maximum, rectangle) => Math.max(maximum, rectangle.y + rectangle.height), 0);
    const area = width * height;
    const bestArea = bestWidth * bestHeight;
    if (
      !best ||
      area < bestArea ||
      (area === bestArea && Math.max(width, height) < Math.max(bestWidth, bestHeight)) ||
      (area === bestArea && Math.max(width, height) === Math.max(bestWidth, bestHeight) && width < bestWidth)
    ) {
      best = packed;
      bestWidth = width;
      bestHeight = height;
    }
  }
  if (best) {
    return {
      width: bestWidth,
      height: bestHeight,
      rectangles: [...best].sort((left, right) => compareTerrainStableIds(left.id, right.id))
    };
  }

  const totalArea = placementOrder.reduce((area, rectangle) => area + rectangle.width * rectangle.height, 0);
  if (totalArea > maxTextureSize * maxTextureSize) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.AtlasCapacity,
      `Terrain atlas rectangles do not fit device texture limit ${maxTextureSize}`
    );
  }
  if (placementOrder.length > TERRAIN_ATLAS_EXACT_PACKING_LIMIT) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.AtlasSearchIncomplete,
      `Terrain atlas heuristic could not place ${placementOrder.length} rectangles within device limit ${maxTextureSize}; exact search supports at most ${TERRAIN_ATLAS_EXACT_PACKING_LIMIT}`
    );
  }

  const exact = packRectanglesExactly(placementOrder, maxTextureSize);
  if (!exact) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.AtlasCapacity,
      `Terrain atlas rectangles do not fit device texture limit ${maxTextureSize}`
    );
  }
  return {
    width: exact.reduce((maximum, rectangle) => Math.max(maximum, rectangle.x + rectangle.width), 0),
    height: exact.reduce((maximum, rectangle) => Math.max(maximum, rectangle.y + rectangle.height), 0),
    rectangles: [...exact].sort((left, right) => compareTerrainStableIds(left.id, right.id))
  };
}

function packRectanglesExactly(
  rectangles: readonly TerrainAtlasRectangleInput[],
  maxTextureSize: number
): readonly TerrainAtlasRectangle[] | undefined {
  // Every feasible fixed-orientation packing has a normal form whose coordinates are dimension subset sums.
  const xCoordinates = createNormalPatternCoordinates(
    rectangles.map((rectangle) => rectangle.width),
    maxTextureSize
  );
  const yCoordinates = createNormalPatternCoordinates(
    rectangles.map((rectangle) => rectangle.height),
    maxTextureSize
  );
  const packed: TerrainAtlasRectangle[] = [];

  const search = (index: number): boolean => {
    if (index === rectangles.length) return true;
    const rectangle = rectangles[index];
    const previousEquivalent = findPreviousEquivalentPlacement(rectangles, packed, index);
    for (const y of yCoordinates) {
      if (y + rectangle.height > maxTextureSize) break;
      for (const x of xCoordinates) {
        if (x + rectangle.width > maxTextureSize) break;
        if (
          previousEquivalent &&
          (y < previousEquivalent.y || (y === previousEquivalent.y && x <= previousEquivalent.x))
        ) {
          continue;
        }
        const candidate: TerrainAtlasRectangle = { ...rectangle, x, y };
        if (packed.some((placed) => rectanglesIntersect(placed, candidate))) continue;
        packed.push(candidate);
        if (search(index + 1)) return true;
        packed.pop();
      }
    }
    return false;
  };

  return search(0) ? packed : undefined;
}

function createNormalPatternCoordinates(dimensions: readonly number[], maxTextureSize: number): readonly number[] {
  const coordinates = new Set<number>([0]);
  for (const dimension of dimensions) {
    const existing = [...coordinates];
    for (const coordinate of existing) {
      const next = coordinate + dimension;
      if (next <= maxTextureSize) coordinates.add(next);
    }
  }
  return [...coordinates].sort((left, right) => left - right);
}

function findPreviousEquivalentPlacement(
  rectangles: readonly TerrainAtlasRectangleInput[],
  packed: readonly TerrainAtlasRectangle[],
  index: number
): TerrainAtlasRectangle | undefined {
  const rectangle = rectangles[index];
  for (let previous = index - 1; previous >= 0; previous--) {
    if (rectangles[previous].width === rectangle.width && rectangles[previous].height === rectangle.height) {
      return packed[previous];
    }
  }
  return undefined;
}

function packMaxRectangles(
  rectangles: readonly TerrainAtlasRectangleInput[],
  atlasWidth: number,
  atlasHeight: number
): readonly TerrainAtlasRectangle[] | undefined {
  let freeRectangles: AtlasSpace[] = [{ x: 0, y: 0, width: atlasWidth, height: atlasHeight }];
  const packed: TerrainAtlasRectangle[] = [];
  for (const rectangle of rectangles) {
    const placement = findBestPlacement(rectangle, freeRectangles);
    if (!placement) return undefined;
    packed.push(placement);
    freeRectangles = splitFreeRectangles(freeRectangles, placement);
  }
  return packed;
}

function findBestPlacement(
  rectangle: TerrainAtlasRectangleInput,
  freeRectangles: readonly AtlasSpace[]
): TerrainAtlasRectangle | undefined {
  let best: PlacementCandidate | undefined;
  for (const free of freeRectangles) {
    if (rectangle.width > free.width || rectangle.height > free.height) continue;
    const remainingWidth = free.width - rectangle.width;
    const remainingHeight = free.height - rectangle.height;
    const candidate: PlacementCandidate = {
      ...rectangle,
      x: free.x,
      y: free.y,
      shortSide: Math.min(remainingWidth, remainingHeight),
      longSide: Math.max(remainingWidth, remainingHeight)
    };
    if (!best || comparePlacementCandidate(candidate, best) < 0) best = candidate;
  }
  if (!best) return undefined;
  const { shortSide: _shortSide, longSide: _longSide, ...placement } = best;
  return placement;
}

function comparePlacementCandidate(left: PlacementCandidate, right: PlacementCandidate): number {
  return left.shortSide - right.shortSide || left.longSide - right.longSide || left.y - right.y || left.x - right.x;
}

function splitFreeRectangles(freeRectangles: readonly AtlasSpace[], placement: TerrainAtlasRectangle): AtlasSpace[] {
  const split: AtlasSpace[] = [];
  for (const free of freeRectangles) {
    if (!rectanglesIntersect(free, placement)) {
      split.push(free);
      continue;
    }
    const freeRight = free.x + free.width;
    const freeBottom = free.y + free.height;
    const placementRight = placement.x + placement.width;
    const placementBottom = placement.y + placement.height;
    if (placement.x > free.x) split.push({ ...free, width: placement.x - free.x });
    if (placementRight < freeRight) {
      split.push({ ...free, x: placementRight, width: freeRight - placementRight });
    }
    if (placement.y > free.y) split.push({ ...free, height: placement.y - free.y });
    if (placementBottom < freeBottom) {
      split.push({ ...free, y: placementBottom, height: freeBottom - placementBottom });
    }
  }
  return pruneFreeRectangles(split);
}

function pruneFreeRectangles(rectangles: readonly AtlasSpace[]): AtlasSpace[] {
  const unique = new Map<string, AtlasSpace>();
  for (const rectangle of rectangles) {
    if (rectangle.width <= 0 || rectangle.height <= 0) continue;
    unique.set(`${rectangle.x},${rectangle.y},${rectangle.width},${rectangle.height}`, rectangle);
  }
  const candidates = [...unique.values()].sort(
    (left, right) => left.y - right.y || left.x - right.x || left.height - right.height || left.width - right.width
  );
  return candidates.filter(
    (candidate, index) =>
      !candidates.some(
        (container, containerIndex) => containerIndex !== index && strictlyContains(container, candidate)
      )
  );
}

function rectanglesIntersect(left: AtlasSpace, right: TerrainAtlasRectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function strictlyContains(container: AtlasSpace, candidate: AtlasSpace): boolean {
  return (
    container.x <= candidate.x &&
    container.y <= candidate.y &&
    container.x + container.width >= candidate.x + candidate.width &&
    container.y + container.height >= candidate.y + candidate.height &&
    (container.x !== candidate.x ||
      container.y !== candidate.y ||
      container.width !== candidate.width ||
      container.height !== candidate.height)
  );
}

interface AtlasSpace {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface PlacementCandidate extends TerrainAtlasRectangle {
  readonly shortSide: number;
  readonly longSide: number;
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function validateMaxTextureSize(maxTextureSize: number): void {
  if (!Number.isInteger(maxTextureSize) || maxTextureSize < 2) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.InvalidDeviceLimit,
      "Geometry Clipmap requires a valid device texture-size limit"
    );
  }
}

function rejectPositiveAreaOverlap(sources: readonly TerrainClipmapHeightSource[]): void {
  for (let leftIndex = 0; leftIndex < sources.length; leftIndex++) {
    const left = sources[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < sources.length; rightIndex++) {
      const right = sources[rightIndex];
      const overlapX =
        Math.min(left.worldPosition[0] + left.worldSize[0], right.worldPosition[0] + right.worldSize[0]) -
        Math.max(left.worldPosition[0], right.worldPosition[0]);
      const overlapZ =
        Math.min(left.worldPosition[2] + left.worldSize[2], right.worldPosition[2] + right.worldSize[2]) -
        Math.max(left.worldPosition[2], right.worldPosition[2]);
      if (overlapX > 0 && overlapZ > 0) {
        throw new TerrainAtlasError(
          TerrainAtlasErrorCode.OverlappingRegions,
          `Geometry Clipmap active Regions "${left.id}" and "${right.id}" overlap in world space`
        );
      }
    }
  }
}
