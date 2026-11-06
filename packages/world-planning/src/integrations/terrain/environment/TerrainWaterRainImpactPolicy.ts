import type { WaterSurfaceProvider } from "@galacean/engine-water/water/runtime/index";

/** Fixed near-field budget for Water rain impacts in the Integrated World demo. */
export interface TerrainWaterRainImpactPolicy {
  readonly minimumDistance: number;
  readonly fullVisibilityDistance: number;
  readonly maximumDistance: number;
  readonly baseImpactsPerSecond: number;
  readonly minimumDropletsPerImpact: number;
  readonly maximumDropletsPerImpact: number;
  readonly stormDropletBonus: number;
  readonly searchAttempts: number;
  readonly rainOnset: number;
  readonly stormOnset: number;
  readonly minimumRippleStrength: number;
  readonly maximumRippleStrength: number;
}

export const TERRAIN_WATER_RAIN_IMPACT_POLICY: Readonly<TerrainWaterRainImpactPolicy> = Object.freeze({
  minimumDistance: 2,
  fullVisibilityDistance: 24,
  maximumDistance: 55,
  baseImpactsPerSecond: 24,
  minimumDropletsPerImpact: 5,
  maximumDropletsPerImpact: 9,
  stormDropletBonus: 2,
  searchAttempts: 4,
  rainOnset: 0.02,
  stormOnset: 0.68,
  minimumRippleStrength: 0.85,
  maximumRippleStrength: 1.15
});

export interface TerrainWaterRainImpactEmission {
  rainAmount: number;
  stormAmount: number;
  impactsPerSecond: number;
  dropletsPerImpact: number;
  splashParticlesPerSecond: number;
}

export interface TerrainWaterRainImpactBounds {
  readonly minimum: readonly [x: number, y: number, z: number];
  readonly maximum: readonly [x: number, y: number, z: number];
}

/** Water sampling contract augmented with the occupied bounds used for the zero-query far gate. */
export interface TerrainWaterRainImpactSurfaceProvider extends WaterSurfaceProvider {
  getBounds(): TerrainWaterRainImpactBounds;
}

/** Creates caller-owned storage so the runtime can resolve weather density without per-frame allocation. */
export function createTerrainWaterRainImpactEmission(): TerrainWaterRainImpactEmission {
  return {
    rainAmount: 0,
    stormAmount: 0,
    impactsPerSecond: 0,
    dropletsPerImpact: 0,
    splashParticlesPerSecond: 0
  };
}

/** Mirrors Water ripple rain/storm response into near-field impact and droplet counts. */
export function resolveTerrainWaterRainImpactEmission(
  rainRate: number,
  out: TerrainWaterRainImpactEmission = createTerrainWaterRainImpactEmission()
): TerrainWaterRainImpactEmission {
  const policy = TERRAIN_WATER_RAIN_IMPACT_POLICY;
  const clampedRainRate = clamp01(rainRate);
  const rainAmount = smoothstep(policy.rainOnset, 1, clampedRainRate);
  const stormAmount = smoothstep(policy.stormOnset, 1, clampedRainRate);
  out.rainAmount = rainAmount;
  out.stormAmount = stormAmount;
  if (rainAmount <= 0) {
    out.impactsPerSecond = 0;
    out.dropletsPerImpact = 0;
    out.splashParticlesPerSecond = 0;
    return out;
  }
  const rippleStrength = rainAmount * mix(policy.minimumRippleStrength, policy.maximumRippleStrength, stormAmount);
  const nonStormDropletRange =
    policy.maximumDropletsPerImpact - policy.minimumDropletsPerImpact - policy.stormDropletBonus;
  const dropletsPerImpact = Math.round(
    policy.minimumDropletsPerImpact + nonStormDropletRange * rainAmount + policy.stormDropletBonus * stormAmount
  );
  out.impactsPerSecond = policy.baseImpactsPerSecond * rippleStrength;
  out.dropletsPerImpact = dropletsPerImpact;
  out.splashParticlesPerSecond = out.impactsPerSecond * dropletsPerImpact;
  return out;
}

/** Returns a smooth near-to-far visibility weight with a hard zero beyond the budget. */
export function resolveTerrainWaterRainImpactVisibility(distance: number): number {
  const { fullVisibilityDistance, maximumDistance } = TERRAIN_WATER_RAIN_IMPACT_POLICY;
  if (!Number.isFinite(distance) || distance >= maximumDistance) return 0;
  if (distance <= fullVisibilityDistance) return 1;
  const amount = (distance - fullVisibilityDistance) / (maximumDistance - fullVisibilityDistance);
  const smoothAmount = amount * amount * (3 - 2 * amount);
  return 1 - smoothAmount;
}

/** Maps a deterministic unit random value into the only interval eligible for Water queries. */
export function sampleTerrainWaterRainImpactDistance(unitRandom: number): number {
  const { minimumDistance, maximumDistance } = TERRAIN_WATER_RAIN_IMPACT_POLICY;
  const amount = Number.isFinite(unitRandom) ? Math.min(1, Math.max(0, unitRandom)) : 0;
  return minimumDistance + (maximumDistance - minimumDistance) * amount;
}

/** Returns the shortest three-dimensional distance from a point to occupied Water bounds. */
export function distanceToTerrainWaterRainImpactBounds(
  point: Readonly<{ x: number; y: number; z: number }>,
  bounds: TerrainWaterRainImpactBounds
): number {
  const [minimumX, minimumY, minimumZ] = bounds.minimum;
  const [maximumX, maximumY, maximumZ] = bounds.maximum;
  const deltaX = Math.max(minimumX - point.x, 0, point.x - maximumX);
  const deltaY = Math.max(minimumY - point.y, 0, point.y - maximumY);
  const deltaZ = Math.max(minimumZ - point.z, 0, point.z - maximumZ);
  return Math.hypot(deltaX, deltaY, deltaZ);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
