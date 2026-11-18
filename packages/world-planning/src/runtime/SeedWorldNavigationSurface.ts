import type { Vector3 } from "@galacean/engine";
import type { TerrainNavigationGroundProvider } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import {
  SEED_WORLD_WETLAND_WATER_MINIMUM_WEIGHT,
  sampleSeedWorldHeight,
  type SeedWorldFields
} from "./SeedWorldFields.ts";
import type { SeedWorldHydrologyArtifactV1 } from "./hydrology-v1/SeedWorldHydrologyArtifact.ts";

export type SeedWorldGeneratedNavigationWaterKind = "lake" | "ocean";

/** Live Water facts needed by navigation without enabling public Water Query/Buoyancy channels. */
export interface SeedWorldNavigationWaterSurfaceSource {
  /** Returns the currently rendered uniform datum, or undefined before that generated body is published. */
  getEffectiveGeneratedWaterLevelMetres(
    bodyId: string,
    kind: SeedWorldGeneratedNavigationWaterKind
  ): number | undefined;
  /** Samples only successfully published Authoring Water bodies. */
  sampleAuthoredNavigationSurfaceHeight(worldX: number, worldZ: number): number | undefined;
}

export interface SeedWorldNavigationSurfaceConfig {
  readonly fields: SeedWorldFields;
  readonly hydrologyArtifact: SeedWorldHydrologyArtifactV1;
  readonly water: SeedWorldNavigationWaterSurfaceSource;
}

const enum GeneratedWaterKindCode {
  None = 0,
  Lake = 1,
  Ocean = 2
}

const TERRAIN_NORMAL_SAMPLE_DISTANCE_METRES = 1;

/**
 * Allocation-free composite floor for Seed World roaming.
 *
 * Terrain remains authoritative on dry land. Inside an authoritative Lake/Ocean
 * ownership cell, or a successfully published Authoring Water footprint, the
 * stable effective water datum becomes an additional floor. Animated Gerstner
 * displacement is deliberately excluded so walking does not bob with waves.
 */
export class SeedWorldNavigationSurface implements TerrainNavigationGroundProvider {
  readonly fields: SeedWorldFields;

  private readonly _artifact: SeedWorldHydrologyArtifactV1;
  private readonly _water: SeedWorldNavigationWaterSurfaceSource;
  private readonly _bodyKindCodes: Uint8Array;
  private readonly _bodyIds: string[];
  private readonly _canonicalWaterLevels: Float64Array;
  private readonly _worldMinimumX: number;
  private readonly _worldMinimumZ: number;
  private readonly _worldMaximumX: number;
  private readonly _worldMaximumZ: number;
  private readonly _ownershipCellSizeMetres: number;
  private _lastWorldX = Number.NaN;
  private _lastWorldZ = Number.NaN;
  private _lastTerrainHeight = Number.NaN;
  private _lastHeight = Number.NaN;
  private _lastContactIsWater = false;
  private _generatedWaterOwned = false;

  constructor(config: Readonly<SeedWorldNavigationSurfaceConfig>) {
    this.fields = config.fields;
    this._artifact = config.hydrologyArtifact;
    this._water = config.water;
    const ownership = this._artifact.ownershipView;
    const transform = ownership.transform;
    const worldSizeX = transform.worldSizeXMillimetres / 1_000;
    const worldSizeZ = transform.worldSizeZMillimetres / 1_000;
    if (Math.abs(worldSizeX - this.fields.sizeMetres) > 1e-6 || Math.abs(worldSizeZ - this.fields.sizeMetres) > 1e-6) {
      throw new Error("Seed World navigation surface requires matching Terrain and Hydrology world extents.");
    }
    this._worldMinimumX = transform.worldMinXMillimetres / 1_000;
    this._worldMinimumZ = transform.worldMinZMillimetres / 1_000;
    this._worldMaximumX = this._worldMinimumX + worldSizeX;
    this._worldMaximumZ = this._worldMinimumZ + worldSizeZ;
    this._ownershipCellSizeMetres = transform.ownershipCellMillimetres / 1_000;
    this._bodyKindCodes = new Uint8Array(this._artifact.waterBodyCatalog.length + 1);
    this._bodyIds = Array.from({ length: this._bodyKindCodes.length }, () => "");
    this._canonicalWaterLevels = new Float64Array(this._bodyKindCodes.length).fill(Number.NaN);
    for (let catalogIndex = 0; catalogIndex < this._artifact.waterBodyCatalog.length; catalogIndex++) {
      const body = this._artifact.waterBodyCatalog[catalogIndex]!;
      if (body.waterType !== "lake" && body.waterType !== "ocean") continue;
      if (body.uniformSurfaceHeightMillimetres === undefined) {
        throw new Error(`Seed World ${body.waterType} '${body.bodyId}' has no uniform navigation datum.`);
      }
      const bodyIndex = catalogIndex + 1;
      this._bodyKindCodes[bodyIndex] =
        body.waterType === "lake" ? GeneratedWaterKindCode.Lake : GeneratedWaterKindCode.Ocean;
      this._bodyIds[bodyIndex] = body.bodyId;
      this._canonicalWaterLevels[bodyIndex] = body.uniformSurfaceHeightMillimetres / 1_000;
    }
  }

  ownsFields(fields: SeedWorldFields): boolean {
    return fields === this.fields;
  }

  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined {
    const terrainHeight = sampleSeedWorldHeight(this.fields, worldX, worldZ);
    this._lastWorldX = worldX;
    this._lastWorldZ = worldZ;
    if (terrainHeight === undefined || !Number.isFinite(terrainHeight)) {
      this._lastTerrainHeight = Number.NaN;
      this._lastHeight = Number.NaN;
      this._lastContactIsWater = false;
      return undefined;
    }

    let waterHeight = Number.NEGATIVE_INFINITY;
    const generatedWaterHeight = this._sampleGeneratedWaterHeight(worldX, worldZ);
    if (generatedWaterHeight !== undefined) waterHeight = generatedWaterHeight;
    const authoredWaterHeight = this._water.sampleAuthoredNavigationSurfaceHeight(worldX, worldZ);
    if (authoredWaterHeight !== undefined && Number.isFinite(authoredWaterHeight)) {
      waterHeight = Math.max(waterHeight, authoredWaterHeight);
    }
    if (!this._generatedWaterOwned) {
      const legacyWetlandHeight = this._sampleLegacyWetlandWaterHeight(worldX, worldZ);
      if (legacyWetlandHeight !== undefined) waterHeight = Math.max(waterHeight, legacyWetlandHeight);
    }

    const waterWins = Number.isFinite(waterHeight) && waterHeight >= terrainHeight;
    const height = waterWins ? waterHeight : terrainHeight;
    this._lastTerrainHeight = terrainHeight;
    this._lastHeight = height;
    this._lastContactIsWater = waterWins;
    return height;
  }

  /** Uses the exact navigation winner, including equal-height water and authored rivers. */
  sampleContactIsWater(worldX: number, worldZ: number): boolean {
    this.sampleHeightInterpolated(worldX, worldZ);
    return this._lastContactIsWater;
  }

  sampleNormalInterpolated(worldX: number, worldZ: number, outNormal: Vector3): boolean {
    if (worldX !== this._lastWorldX || worldZ !== this._lastWorldZ || !Number.isFinite(this._lastHeight)) {
      if (this.sampleHeightInterpolated(worldX, worldZ) === undefined) return false;
    }
    if (this._lastContactIsWater) {
      outNormal.set(0, 1, 0);
      return true;
    }
    const center = this._lastTerrainHeight;
    if (!Number.isFinite(center)) return false;
    const distance = TERRAIN_NORMAL_SAMPLE_DISTANCE_METRES;
    const slopeX = resolveGroundSlope(
      sampleSeedWorldHeight(this.fields, worldX - distance, worldZ),
      center,
      sampleSeedWorldHeight(this.fields, worldX + distance, worldZ),
      distance
    );
    const slopeZ = resolveGroundSlope(
      sampleSeedWorldHeight(this.fields, worldX, worldZ - distance),
      center,
      sampleSeedWorldHeight(this.fields, worldX, worldZ + distance),
      distance
    );
    if (slopeX === undefined || slopeZ === undefined) return false;
    outNormal.set(-slopeX, 1, -slopeZ).normalize();
    return true;
  }

  private _sampleGeneratedWaterHeight(worldX: number, worldZ: number): number | undefined {
    this._generatedWaterOwned = false;
    if (
      worldX < this._worldMinimumX ||
      worldX >= this._worldMaximumX ||
      worldZ < this._worldMinimumZ ||
      worldZ >= this._worldMaximumZ
    ) {
      return undefined;
    }
    const ownership = this._artifact.ownershipView;
    const x = Math.floor((worldX - this._worldMinimumX) / this._ownershipCellSizeMetres);
    const z = Math.floor((worldZ - this._worldMinimumZ) / this._ownershipCellSizeMetres);
    if (x < 0 || z < 0 || x >= ownership.resolution || z >= ownership.resolution) return undefined;
    const bodyIndex = ownership.sampleBodyIndex(x, z);
    const kindCode = this._bodyKindCodes[bodyIndex] ?? GeneratedWaterKindCode.None;
    if (kindCode === GeneratedWaterKindCode.None) return undefined;
    this._generatedWaterOwned = true;
    const bodyId = this._bodyIds[bodyIndex]!;
    const kind: SeedWorldGeneratedNavigationWaterKind = kindCode === GeneratedWaterKindCode.Lake ? "lake" : "ocean";
    const effective = this._water.getEffectiveGeneratedWaterLevelMetres(bodyId, kind);
    if (effective !== undefined && Number.isFinite(effective)) return effective;
    const canonical = this._canonicalWaterLevels[bodyIndex];
    return Number.isFinite(canonical) ? canonical : undefined;
  }

  /** Preserves the existing river/wetland floor while Lake/Ocean move to authoritative Ownership. */
  private _sampleLegacyWetlandWaterHeight(worldX: number, worldZ: number): number | undefined {
    const normalizedX = Math.min(1, Math.max(0, worldX / this.fields.sizeMetres + 0.5));
    const normalizedZ = Math.min(1, Math.max(0, worldZ / this.fields.sizeMetres + 0.5));
    const surfaceX = Math.min(
      this.fields.surfaceResolution - 1,
      Math.floor(normalizedX * this.fields.surfaceResolution)
    );
    const surfaceZ = Math.min(
      this.fields.surfaceResolution - 1,
      Math.floor(normalizedZ * this.fields.surfaceResolution)
    );
    const index = surfaceZ * this.fields.surfaceResolution + surfaceX;
    if (this.fields.wetlandWeight[index]! / 255 < SEED_WORLD_WETLAND_WATER_MINIMUM_WEIGHT) {
      return undefined;
    }
    const waterLevel = this.fields.wetlandWaterLevelMetres[index];
    return Number.isFinite(waterLevel) ? waterLevel : undefined;
  }
}

function resolveGroundSlope(
  negativeSample: number | undefined,
  centerSample: number,
  positiveSample: number | undefined,
  distance: number
): number | undefined {
  const hasNegative = negativeSample !== undefined && Number.isFinite(negativeSample);
  const hasPositive = positiveSample !== undefined && Number.isFinite(positiveSample);
  if (hasNegative && hasPositive) return (positiveSample! - negativeSample!) / (distance * 2);
  if (hasPositive) return (positiveSample! - centerSample) / distance;
  if (hasNegative) return (centerSample - negativeSample!) / distance;
  return undefined;
}
