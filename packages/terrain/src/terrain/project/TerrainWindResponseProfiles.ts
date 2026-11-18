import type { WindLodPolicy, WindResponseProfile } from "@galacean/engine";

/** Wind animation quality is independent from mesh LOD and fades every retained feature. */
export const TERRAIN_TREE_WIND_LOD_POLICY: Readonly<WindLodPolicy> = {
  transitionMeters: 12,
  bands: [
    {
      tier: "hero",
      maximumDistanceMeters: 18,
      primaryMotion: 1,
      secondaryMotion: 1,
      microMotion: 1,
      localField: 1,
      statefulResponse: 1
    },
    {
      tier: "near",
      maximumDistanceMeters: 52,
      primaryMotion: 0.92,
      secondaryMotion: 0.8,
      microMotion: 0.55,
      localField: 0.65,
      statefulResponse: 0.72
    },
    {
      tier: "mid",
      maximumDistanceMeters: 112,
      primaryMotion: 0.58,
      secondaryMotion: 0.32,
      microMotion: 0,
      localField: 0,
      statefulResponse: 0.28
    },
    {
      tier: "far",
      maximumDistanceMeters: 190,
      primaryMotion: 0.24,
      secondaryMotion: 0,
      microMotion: 0,
      localField: 0,
      statefulResponse: 0
    }
  ]
};

/** Whole-tree low-frequency response. Branch and leaf detail remains a separate GPU adapter. */
export interface TerrainTreeWindResponseProfile extends WindResponseProfile {
  readonly maximumBendRadians: number;
  /** Normalized share of the authored bend range occupied by the calibrated quasi-static load. */
  readonly equilibriumBendLimit: number;
}

/** Production Gale is the physical calibration point: default 4 m/s air speed × the 2.4 Gale multiplier. */
export const TERRAIN_HERO_TREE_EQUILIBRIUM_REFERENCE_SPEED_MPS = 9.6;

/**
 * Derives linear structural compliance from a species' authored equilibrium travel.
 *
 * The GPU state stores dynamic pressure normalized by `referenceSpeedMps²`, and the vertex
 * transfer is `1 - exp(-pressure * compliance)`. Inverting that exact transfer makes an exposed
 * steady Gale land on `equilibriumBendLimit`; the rest of the mechanical angle remains available
 * to the same retained second-order state for gust compression and unloading recoil.
 */
export function terrainHeroTreeCalibratedComplianceGain(
  primaryProfile: Readonly<TerrainTreeWindResponseProfile>
): number {
  const referencePressure = Math.pow(
    TERRAIN_HERO_TREE_EQUILIBRIUM_REFERENCE_SPEED_MPS / primaryProfile.referenceSpeedMps,
    2
  );
  return -Math.log(1 - primaryProfile.equilibriumBendLimit) / referencePressure;
}

export const TERRAIN_TREE_WIND_RESPONSE_PROFILE: Readonly<TerrainTreeWindResponseProfile> = {
  id: "terrain-tree-primary-v1",
  consumerKind: "tree",
  layer: "canopy",
  referenceSpeedMps: 8,
  meanGain: 0.52,
  gustGain: 0.88,
  turbulenceGain: 0.16,
  localGain: 0.72,
  naturalFrequencyHz: 0.58,
  dampingRatio: 0.78,
  // 0.80 Hz cutoff: preserves steady gale load while rejecting pressure edges a trunk cannot follow.
  targetSmoothingSeconds: 0.2,
  maximumResponse: 1,
  maximumBendRadians: 0.13,
  equilibriumBendLimit: 0.78,
  lodPolicy: TERRAIN_TREE_WIND_LOD_POLICY
};

export type TerrainHeroTreeWindCalibrationKey = "broadleaf-large" | "broadleaf-medium" | "birch-large" | "birch-medium";

/**
 * Hero trees keep their signed primary-structure state and low-frequency travel through every
 * visible distance band. Authored projected-size Full/Reduced/Far materials own the actual work
 * reduction; this generic policy must never attenuate that shared state a second time.
 */
export const TERRAIN_HERO_TREE_WIND_LOD_POLICY: Readonly<WindLodPolicy> = {
  transitionMeters: 12,
  bands: [
    {
      tier: "hero",
      maximumDistanceMeters: 18,
      primaryMotion: 1,
      secondaryMotion: 1,
      microMotion: 1,
      localField: 1,
      statefulResponse: 1
    },
    {
      tier: "near",
      maximumDistanceMeters: 52,
      primaryMotion: 1,
      secondaryMotion: 0.8,
      microMotion: 0.55,
      localField: 0.65,
      statefulResponse: 1
    },
    {
      tier: "mid",
      maximumDistanceMeters: 112,
      primaryMotion: 1,
      secondaryMotion: 0.32,
      microMotion: 0,
      localField: 0,
      statefulResponse: 1
    },
    {
      tier: "far",
      maximumDistanceMeters: 190,
      primaryMotion: 1,
      secondaryMotion: 0,
      microMotion: 0,
      localField: 0,
      statefulResponse: 1
    }
  ]
};

function heroTreePrimaryResponse(
  key: TerrainHeroTreeWindCalibrationKey,
  naturalFrequencyHz: number,
  dampingRatio: number,
  targetSmoothingSeconds: number,
  maximumBendRadians: number,
  meanGain: number,
  gustGain: number,
  turbulenceGain: number,
  equilibriumBendLimit: number
): Readonly<TerrainTreeWindResponseProfile> {
  return Object.freeze({
    ...TERRAIN_TREE_WIND_RESPONSE_PROFILE,
    id: `terrain-tree-primary-${key}-v6`,
    meanGain,
    gustGain,
    turbulenceGain,
    naturalFrequencyHz,
    dampingRatio,
    targetSmoothingSeconds,
    maximumResponse: 1,
    maximumBendRadians,
    equilibriumBendLimit,
    lodPolicy: TERRAIN_HERO_TREE_WIND_LOD_POLICY
  });
}

/**
 * Signed, under-damped primary-structure responses. Mean load remains one-way, while the retained
 * displacement and velocity may cross the new equilibrium by a bounded species-dependent amount.
 */
export const TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES: Readonly<
  Record<TerrainHeroTreeWindCalibrationKey, Readonly<TerrainTreeWindResponseProfile>>
> = Object.freeze({
  "broadleaf-large": heroTreePrimaryResponse("broadleaf-large", 0.38, 0.62, 0.18, 0.16, 0.5, 1.02, 0.78, 0.72),
  "broadleaf-medium": heroTreePrimaryResponse("broadleaf-medium", 0.46, 0.6, 0.16, 0.17, 0.52, 1.04, 0.82, 0.7),
  "birch-large": heroTreePrimaryResponse("birch-large", 0.56, 0.58, 0.13, 0.18, 0.54, 1.06, 0.86, 0.68),
  "birch-medium": heroTreePrimaryResponse("birch-medium", 0.68, 0.56, 0.11, 0.19, 0.56, 1.08, 0.9, 0.66)
});

/** Shader-side transfer values packed into three Scene vectors per receiver family. */
export interface TerrainVegetationWindResponseProfile extends WindResponseProfile {
  readonly bendGain: number;
  readonly dynamicGain: number;
  readonly macroGain: number;
  readonly mesoGain: number;
  readonly microGain: number;
  readonly responseLagSeconds: number;
  readonly maximumBendRadians: number;
  readonly flutterWeight: number;
  readonly flutterFrequencyMinHz: number;
  readonly flutterFrequencyMaxHz: number;
  readonly highSpeedMicroScale: number;
}

const VEGETATION_GPU_LOD_POLICY: Readonly<WindLodPolicy> = {
  transitionMeters: 16,
  bands: [
    {
      tier: "hero",
      maximumDistanceMeters: 36,
      primaryMotion: 1,
      secondaryMotion: 1,
      microMotion: 1,
      localField: 1,
      statefulResponse: 0
    },
    {
      tier: "near",
      maximumDistanceMeters: 72,
      primaryMotion: 1,
      secondaryMotion: 1,
      microMotion: 0,
      localField: 0,
      statefulResponse: 0
    },
    {
      tier: "mid",
      maximumDistanceMeters: 120,
      primaryMotion: 0.82,
      secondaryMotion: 0.6,
      microMotion: 0,
      localField: 0,
      statefulResponse: 0
    },
    {
      tier: "far",
      maximumDistanceMeters: 220,
      primaryMotion: 0.42,
      secondaryMotion: 0,
      microMotion: 0,
      localField: 0,
      statefulResponse: 0
    }
  ]
};

const COMMON_GPU_PROFILE = {
  consumerKind: "vegetation" as const,
  referenceSpeedMps: 8,
  meanGain: 1,
  gustGain: 1,
  turbulenceGain: 1,
  localGain: 1,
  dampingRatio: 1,
  maximumResponse: 1,
  lodPolicy: VEGETATION_GPU_LOD_POLICY
};

export const TERRAIN_GRASS_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-grass-gpu-v1",
  layer: "ground",
  naturalFrequencyHz: 1.8,
  dampingRatio: 0.82,
  // Grass blades have orders of magnitude less flexural rigidity than woody receivers. Keep
  // the authored per-material WindForce as the species/stem stiffness term, but map physical
  // air speed into enough angular travel for a 12 m/s gale to produce visible lodging.
  bendGain: 6,
  dynamicGain: 1.12,
  macroGain: 0.72,
  mesoGain: 1,
  microGain: 0.62,
  responseLagSeconds: 0.03,
  maximumBendRadians: 1.22,
  flutterWeight: 0.65,
  flutterFrequencyMinHz: 1.45,
  flutterFrequencyMaxHz: 2.15,
  // Once a flexible blade has reconfigured into the airflow, its projected area and therefore
  // its differential flutter torque collapse. Keep the low-frequency lodging/wheat-wave modes
  // untouched, but retain only a small tip mode in a gale; leaving this at 1 made grass and
  // flower cards oscillate four to eight times farther than the visually stable shrub receiver.
  highSpeedMicroScale: 0.22
};

/**
 * Flower stems share the ground wind field with grass, but their terminal blossom adds a
 * concentrated mass and a slower under-damped recovery. The response stays separate so dense
 * grass never pays for the retained ground-response state used by flower heads.
 */
export const TERRAIN_FLOWER_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-flower-gpu-v1",
  layer: "ground",
  naturalFrequencyHz: 1.22,
  dampingRatio: 0.74,
  bendGain: 5.4,
  dynamicGain: 0.94,
  macroGain: 0.68,
  mesoGain: 0.72,
  microGain: 0.34,
  responseLagSeconds: 0.08,
  maximumBendRadians: 1.08,
  flutterWeight: 0.38,
  flutterFrequencyMinHz: 0.86,
  flutterFrequencyMaxHz: 1.34,
  highSpeedMicroScale: 0.14
};

export const TERRAIN_LEAF_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-leaf-gpu-v1",
  layer: "canopy",
  naturalFrequencyHz: 0.95,
  bendGain: 0.65,
  dynamicGain: 0.5,
  macroGain: 0.5,
  mesoGain: 0.78,
  microGain: 1.55,
  responseLagSeconds: 0.12,
  maximumBendRadians: 0.28,
  flutterWeight: 1,
  flutterFrequencyMinHz: 4.8,
  flutterFrequencyMaxHz: 7.2,
  highSpeedMicroScale: 0.5
};

/** Ground-anchored woody foliage bends as a shrub body, independently from tree-crown leaf cards. */
export const TERRAIN_SHRUB_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-shrub-gpu-v1",
  layer: "ground",
  naturalFrequencyHz: 0.95,
  dampingRatio: 0.9,
  bendGain: 10,
  dynamicGain: 0.5,
  macroGain: 0.5,
  mesoGain: 0.78,
  microGain: 1.55,
  responseLagSeconds: 0.12,
  maximumBendRadians: 1.05,
  flutterWeight: 1,
  flutterFrequencyMinHz: 4.8,
  flutterFrequencyMaxHz: 7.2,
  highSpeedMicroScale: 0.5
};

export const TERRAIN_BRANCH_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-branch-gpu-v1",
  layer: "canopy",
  naturalFrequencyHz: 0.82,
  bendGain: 0.5,
  dynamicGain: 0.34,
  macroGain: 0.9,
  mesoGain: 0.56,
  microGain: 0.14,
  responseLagSeconds: 0.12,
  maximumBendRadians: 0.24,
  flutterWeight: 0.15,
  flutterFrequencyMinHz: 0.75,
  flutterFrequencyMaxHz: 1.05,
  highSpeedMicroScale: 1
};

export const TERRAIN_BILLBOARD_WIND_RESPONSE_PROFILE: Readonly<TerrainVegetationWindResponseProfile> = {
  ...COMMON_GPU_PROFILE,
  id: "terrain-tree-billboard-gpu-v1",
  consumerKind: "tree",
  layer: "canopy",
  naturalFrequencyHz: 0.5,
  bendGain: 0.32,
  dynamicGain: 0.45,
  macroGain: 0.82,
  mesoGain: 0,
  microGain: 0,
  responseLagSeconds: 0.18,
  maximumBendRadians: 0.18,
  flutterWeight: 0,
  flutterFrequencyMinHz: 1,
  flutterFrequencyMaxHz: 1,
  highSpeedMicroScale: 1
};

const ATMOSPHERIC_WIND_LOD_POLICY: Readonly<WindLodPolicy> = {
  transitionMeters: 0,
  bands: [
    {
      tier: "hero",
      maximumDistanceMeters: 1_000_000,
      primaryMotion: 1,
      secondaryMotion: 1,
      microMotion: 1,
      localField: 1,
      statefulResponse: 1
    }
  ]
};

/** P3 cloud-layer transport rejects fast local changes while retaining travelling weather fronts. */
export const TERRAIN_P3_CLOUD_WIND_RESPONSE_PROFILE: Readonly<WindResponseProfile> = {
  id: "terrain-p3-volumetric-cloud-advection-v1",
  consumerKind: "cloud",
  layer: "cloud",
  referenceSpeedMps: 1,
  meanGain: 1,
  gustGain: 0.22,
  turbulenceGain: 0.08,
  localGain: 0,
  naturalFrequencyHz: 0.18,
  dampingRatio: 1,
  maximumResponse: 80,
  lodPolicy: ATMOSPHERIC_WIND_LOD_POLICY
};

/** P3 rain responds quickly, while its ballistic particle solver retains most drop inertia. */
export const TERRAIN_P3_RAIN_WIND_RESPONSE_PROFILE: Readonly<WindResponseProfile> = {
  id: "terrain-p3-rain-drift-v1",
  consumerKind: "precipitation",
  layer: "canopy",
  referenceSpeedMps: 1,
  meanGain: 0.55,
  gustGain: 0.42,
  turbulenceGain: 0.35,
  localGain: 0.5,
  naturalFrequencyHz: 2.4,
  dampingRatio: 0.92,
  maximumResponse: 18,
  lodPolicy: ATMOSPHERIC_WIND_LOD_POLICY
};

/** P3 snow follows canopy air more fully and changes course with a softer high-drag response. */
export const TERRAIN_P3_SNOW_WIND_RESPONSE_PROFILE: Readonly<WindResponseProfile> = {
  id: "terrain-p3-snow-drift-v1",
  consumerKind: "precipitation",
  layer: "canopy",
  referenceSpeedMps: 1,
  meanGain: 1.15,
  gustGain: 0.92,
  turbulenceGain: 0.8,
  localGain: 1.15,
  naturalFrequencyHz: 0.72,
  dampingRatio: 0.96,
  maximumResponse: 22,
  lodPolicy: ATMOSPHERIC_WIND_LOD_POLICY
};
