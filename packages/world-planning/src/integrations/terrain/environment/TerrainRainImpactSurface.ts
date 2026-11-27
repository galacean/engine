import type { TerrainProjectDocument } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import type { TerrainPuddleHydrologyField } from "@galacean/engine-terrain/terrain/clipmap/TerrainPuddleHydrology";

/** Caller-owned rain-response contact populated from canonical Terrain data. */
export interface TerrainRainImpactSample {
  /** Rendered Terrain height at the requested world-space point. */
  height: number;
  /** Unit surface normal reconstructed from the same canonical heightfield. */
  readonly normal: [number, number, number];
  /** Rain-retaining surface coverage shared with `SurfaceClimate.glsl`. */
  puddleMask: number;
}

/** Creates storage for repeated allocation-free rain-impact queries. */
export function createTerrainRainImpactSample(): TerrainRainImpactSample {
  return { height: 0, normal: [0, 1, 0], puddleMask: 0 };
}

/** Dynamic storage inputs used by the shared standing-water coverage function. */
export interface TerrainRainImpactClimate {
  readonly puddleStorage: number;
}

/** World-space XZ window used to preselect resident height Regions for repeated sampling. */
export interface TerrainHeightSamplingBounds {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

/** Height and rain-response sampling consumed by the weather presentation. */
export interface TerrainRainImpactSurfaceProvider {
  getPuddleHydrology?(): Readonly<TerrainPuddleHydrologyField> | undefined;
  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined;
  /** Optional allocation-free fast path prepared for a bounded batch such as one wind-field raster. */
  samplePreparedHeightInterpolated?(worldX: number, worldZ: number): number | undefined;
  /** Preselects the resident Regions intersecting a repeated height-sampling window. */
  prepareHeightSampling?(bounds: Readonly<TerrainHeightSamplingBounds>): void;
  /** Monotonic height/residency invalidation token. */
  getHeightRevision?(): number;
  sampleRainImpact(
    worldX: number,
    worldZ: number,
    climate: Readonly<TerrainRainImpactClimate>,
    outSample: TerrainRainImpactSample
  ): boolean;
}

interface TerrainRainImpactRegion {
  readonly document: Pick<TerrainProjectDocument, "descriptor" | "manifest" | "heightmap">;
}

/**
 * Samples rain contacts from the same canonical height payload rendered by the Terrain Clipmap.
 * The provider keeps no copied raster state, so Region residency replacements remain immediately visible.
 */
export class TerrainProjectRainImpactSurface implements TerrainRainImpactSurfaceProvider {
  private readonly _preparedHeightRegions: TerrainRainImpactRegion[] = [];
  private _preparedHeightRevision = -1;
  private _preparedMinimumX = 0;
  private _preparedMinimumZ = 0;
  private _preparedMaximumX = 0;
  private _preparedMaximumZ = 0;
  private _hasPreparedHeightSampling = false;

  constructor(
    private readonly _getRegions: () => readonly TerrainRainImpactRegion[],
    private readonly _getPuddleHydrology: () => TerrainPuddleHydrologyField | undefined = () => undefined,
    private readonly _getHeightRevision: () => number = () => 0
  ) {}

  getPuddleHydrology(): Readonly<TerrainPuddleHydrologyField> | undefined {
    return this._getPuddleHydrology();
  }

  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined {
    const region = findRegion(this._getRegions(), worldX, worldZ);
    return region ? sampleRegionHeight(region, worldX, worldZ) : undefined;
  }

  samplePreparedHeightInterpolated(worldX: number, worldZ: number): number | undefined {
    if (!this._hasPreparedHeightSampling) return this.sampleHeightInterpolated(worldX, worldZ);
    const region = findRegion(this._preparedHeightRegions, worldX, worldZ);
    return region ? sampleRegionHeight(region, worldX, worldZ) : undefined;
  }

  prepareHeightSampling(bounds: Readonly<TerrainHeightSamplingBounds>): void {
    validateSamplingBounds(bounds);
    const unchanged =
      this._hasPreparedHeightSampling &&
      this._preparedMinimumX === bounds.minimumX &&
      this._preparedMinimumZ === bounds.minimumZ &&
      this._preparedMaximumX === bounds.maximumX &&
      this._preparedMaximumZ === bounds.maximumZ;
    this._preparedMinimumX = bounds.minimumX;
    this._preparedMinimumZ = bounds.minimumZ;
    this._preparedMaximumX = bounds.maximumX;
    this._preparedMaximumZ = bounds.maximumZ;
    this._hasPreparedHeightSampling = true;
    if (!unchanged || this._preparedHeightRevision !== this.getHeightRevision()) {
      this._refreshPreparedHeightRegions();
    }
  }

  getHeightRevision(): number {
    const revision = this._getHeightRevision();
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new RangeError("Terrain height revision must be a non-negative safe integer");
    }
    return revision;
  }

  sampleRainImpact(
    worldX: number,
    worldZ: number,
    climate: Readonly<TerrainRainImpactClimate>,
    outSample: TerrainRainImpactSample
  ): boolean {
    const region = findRegion(this._getRegions(), worldX, worldZ);
    if (!region) return false;
    outSample.height = sampleRegionHeight(region, worldX, worldZ);
    sampleRegionNormal(region, worldX, worldZ, outSample.normal);
    outSample.puddleMask = sampleTerrainSurfacePuddleMask(worldX, worldZ, climate, this._getPuddleHydrology());
    return true;
  }

  private _refreshPreparedHeightRegions(): void {
    const revision = this.getHeightRevision();
    const active = this._preparedHeightRegions;
    active.length = 0;
    const regions = this._getRegions();
    for (let index = 0; index < regions.length; index++) {
      const region = regions[index];
      if (
        regionIntersectsBounds(
          region,
          this._preparedMinimumX,
          this._preparedMinimumZ,
          this._preparedMaximumX,
          this._preparedMaximumZ
        )
      ) {
        active.push(region);
      }
    }
    this._preparedHeightRevision = revision;
  }
}

function regionIntersectsBounds(
  region: TerrainRainImpactRegion,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number
): boolean {
  const { worldPosition, worldSize } = region.document.descriptor;
  return (
    worldPosition[0] <= maximumX &&
    worldPosition[0] + worldSize[0] >= minimumX &&
    worldPosition[2] <= maximumZ &&
    worldPosition[2] + worldSize[2] >= minimumZ
  );
}

function validateSamplingBounds(bounds: Readonly<TerrainHeightSamplingBounds>): void {
  if (
    !Number.isFinite(bounds.minimumX) ||
    !Number.isFinite(bounds.minimumZ) ||
    !Number.isFinite(bounds.maximumX) ||
    !Number.isFinite(bounds.maximumZ) ||
    bounds.minimumX > bounds.maximumX ||
    bounds.minimumZ > bounds.maximumZ
  ) {
    throw new RangeError("Terrain height sampling bounds must be finite and ordered");
  }
}

/** CPU parity for the combined masks returned by `terrainProjectSurfaceHydrologyMasks`. */
export function sampleTerrainSurfacePuddleMask(
  worldX: number,
  worldZ: number,
  climate: Readonly<TerrainRainImpactClimate>,
  hydrology: TerrainPuddleHydrologyField | undefined
): number {
  const storage = clamp01(climate.puddleStorage);
  return (hydrology?.sampleCoverage(worldX, worldZ, storage) ?? 0) * smoothstep(0.06, 0.3, storage);
}

/**
 * Converts the hydrology mask directly into stochastic particle acceptance.
 * The mask already represents fractional occupied puddle area, so applying another visibility threshold
 * would erase shoreline splashes and make sparse but visible puddles almost impossible to sample.
 */
export function resolveTerrainPuddleSplashAcceptance(puddleMask: number): number {
  return clamp01(puddleMask);
}

function findRegion(
  regions: readonly TerrainRainImpactRegion[],
  worldX: number,
  worldZ: number
): TerrainRainImpactRegion | undefined {
  for (let index = 0; index < regions.length; index++) {
    const region = regions[index];
    const { worldPosition, worldSize } = region.document.descriptor;
    if (
      worldX >= worldPosition[0] &&
      worldX <= worldPosition[0] + worldSize[0] &&
      worldZ >= worldPosition[2] &&
      worldZ <= worldPosition[2] + worldSize[2]
    ) {
      return region;
    }
  }
  return undefined;
}

function sampleRegionHeight(region: TerrainRainImpactRegion, worldX: number, worldZ: number): number {
  const { descriptor, manifest, heightmap } = region.document;
  const [width, height] = manifest.heightmap.sampleSize;
  const worldPosition = descriptor.worldPosition;
  const worldSize = descriptor.worldSize;
  const sampleX = ((worldX - worldPosition[0]) / worldSize[0]) * (width - 1);
  const sampleZ = ((worldZ - worldPosition[2]) / worldSize[2]) * (height - 1);
  const normalized = bilinearSample(heightmap, width, height, sampleX, sampleZ);
  return (
    descriptor.worldPosition[1] +
    manifest.heightmap.minMetres +
    (normalized / 65535) * (manifest.heightmap.maxMetres - manifest.heightmap.minMetres)
  );
}

function sampleRegionNormal(
  region: TerrainRainImpactRegion,
  worldX: number,
  worldZ: number,
  outNormal: [number, number, number]
): void {
  const { descriptor, manifest } = region.document;
  const [width, height] = manifest.heightmap.sampleSize;
  const minX = descriptor.worldPosition[0];
  const minZ = descriptor.worldPosition[2];
  const maxX = minX + descriptor.worldSize[0];
  const maxZ = minZ + descriptor.worldSize[2];
  const stepX = descriptor.worldSize[0] / Math.max(width - 1, 1);
  const stepZ = descriptor.worldSize[2] / Math.max(height - 1, 1);
  const leftX = Math.max(minX, worldX - stepX);
  const rightX = Math.min(maxX, worldX + stepX);
  const backZ = Math.max(minZ, worldZ - stepZ);
  const frontZ = Math.min(maxZ, worldZ + stepZ);
  const slopeX =
    (sampleRegionHeight(region, rightX, worldZ) - sampleRegionHeight(region, leftX, worldZ)) /
    Math.max(rightX - leftX, Number.EPSILON);
  const slopeZ =
    (sampleRegionHeight(region, worldX, frontZ) - sampleRegionHeight(region, worldX, backZ)) /
    Math.max(frontZ - backZ, Number.EPSILON);
  const inverseLength = 1 / Math.hypot(slopeX, 1, slopeZ);
  outNormal[0] = -slopeX * inverseLength;
  outNormal[1] = inverseLength;
  outNormal[2] = -slopeZ * inverseLength;
}

function bilinearSample(values: Uint16Array, width: number, height: number, sampleX: number, sampleZ: number): number {
  const x0 = Math.max(0, Math.min(Math.floor(sampleX), width - 1));
  const z0 = Math.max(0, Math.min(Math.floor(sampleZ), height - 1));
  const x1 = Math.min(x0 + 1, width - 1);
  const z1 = Math.min(z0 + 1, height - 1);
  const blendX = sampleX - x0;
  const blendZ = sampleZ - z0;
  const row0 = z0 * width;
  const row1 = z1 * width;
  return (
    (values[row0 + x0] * (1 - blendX) + values[row0 + x1] * blendX) * (1 - blendZ) +
    (values[row1 + x0] * (1 - blendX) + values[row1 + x1] * blendX) * blendZ
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function clamp01(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}
