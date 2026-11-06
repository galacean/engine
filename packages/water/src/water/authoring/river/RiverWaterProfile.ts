/** Immutable, versioned authoring profiles shared by River WaterBody consumers. */
import { RiverMaterialPreset, RiverQualityLevel } from "./RiverAuthoringEnums";
import { RIVER_LIMITS, RIVER_MATERIAL_PRESET_CONFIG } from "./RiverAuthoringLimits";
import type { RiverMaterialConfig, RiverSurfaceMotionConfig } from "./RiverAuthoringTypes";
import { hashRiverStableValue } from "../../compiler/shared/determinism";

export const RIVER_WATER_PROFILE_SCHEMA_VERSION = 1 as const;

export interface RiverWaterFeatureRequirementsV1 {
  readonly macroMotion: boolean;
  readonly microMotion: boolean;
  readonly ssr: boolean;
  readonly sceneColor: boolean;
  readonly sceneDepth: boolean;
  readonly opaqueTexture: boolean;
}

export interface RiverWaterProfileV1 {
  readonly schemaVersion: typeof RIVER_WATER_PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: number;
  readonly depth: Readonly<{
    readonly bankHeightRatio: number;
    readonly minimum: number;
    readonly maximum: number;
  }>;
  readonly widthScale: number;
  readonly bankFeatherScale: number;
  readonly maximumBankFeather: number;
  readonly flowSpeed: number;
  readonly materialPreset: RiverMaterialPreset;
  readonly quality: RiverQualityLevel;
  readonly maximumSurfaceSlope: number;
  readonly features: Readonly<RiverWaterFeatureRequirementsV1>;
  /** Explicit physical and presentation facts emitted into River Descriptor V2. */
  readonly descriptorV2: Readonly<{
    readonly material: Readonly<RiverMaterialConfig>;
    readonly surfaceMotion: Readonly<RiverSurfaceMotionConfig>;
  }>;
}

/** Formal Prompt Noise River optics: High geometry with Scene Color/Depth and transparent SSR. */
export const PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1: RiverWaterProfileV1 = deepFreeze({
  schemaVersion: RIVER_WATER_PROFILE_SCHEMA_VERSION,
  id: "prompt-noise-clear-stream-high-v1",
  version: 1,
  depth: {
    bankHeightRatio: 0.1,
    minimum: RIVER_LIMITS.minDepth,
    maximum: RIVER_LIMITS.maxDepth
  },
  widthScale: 1,
  bankFeatherScale: 1,
  maximumBankFeather: RIVER_LIMITS.maxBankFeather,
  flowSpeed: 1.25,
  materialPreset: RiverMaterialPreset.ClearStream,
  quality: RiverQualityLevel.High,
  maximumSurfaceSlope: 0.2,
  features: {
    macroMotion: true,
    microMotion: true,
    ssr: true,
    sceneColor: true,
    sceneDepth: true,
    opaqueTexture: true
  },
  descriptorV2: {
    material: {
      preset: RiverMaterialPreset.ClearStream,
      ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream]
    },
    surfaceMotion: {
      seed: 17831,
      displacementAmplitude: 0.16,
      displacementLengthScale: 4.8,
      shoreDampingWidth: 1.1,
      turbulence: 0.72
    }
  }
});

/** C2-A product profile: Showcase MountainCreek semantics at the High tier. */
export const PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1 = deepFreeze({
  schemaVersion: RIVER_WATER_PROFILE_SCHEMA_VERSION,
  id: "prompt-noise-mountain-river-high-v1",
  version: 1,
  depth: {
    bankHeightRatio: 0.1,
    minimum: RIVER_LIMITS.minDepth,
    maximum: RIVER_LIMITS.maxDepth
  },
  widthScale: 1,
  bankFeatherScale: 1,
  maximumBankFeather: RIVER_LIMITS.maxBankFeather,
  flowSpeed: 1.5,
  materialPreset: RiverMaterialPreset.MountainCreek,
  quality: RiverQualityLevel.High,
  maximumSurfaceSlope: 0.2,
  features: {
    macroMotion: true,
    microMotion: true,
    ssr: true,
    sceneColor: true,
    sceneDepth: true,
    opaqueTexture: true
  },
  descriptorV2: {
    material: {
      preset: RiverMaterialPreset.MountainCreek,
      baseColor: "#087783",
      foamColor: "#eaf8f7",
      foamIntensity: 0.9,
      clarity: 0.92
    },
    surfaceMotion: {
      seed: 39157,
      displacementAmplitude: 0.21,
      displacementLengthScale: 1.2,
      shoreDampingWidth: 0.78,
      turbulence: 0.7
    }
  }
} satisfies RiverWaterProfileV1);

const RIVER_WATER_PROFILES = new Map<string, RiverWaterProfileV1>([
  [PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.id, PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1],
  [PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1.id, PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1]
]);

/** Resolves one immutable profile. Published profile ids cannot be replaced in place. */
export function requireRiverWaterProfile(profileId: string): RiverWaterProfileV1 {
  const profile = RIVER_WATER_PROFILES.get(profileId);
  if (!profile) throw new Error(`Unknown River water profile '${profileId}'.`);
  return profile;
}

/** Canonical profile identity used by descriptor and cache hashes. */
export function hashRiverWaterProfile(profile: RiverWaterProfileV1): string {
  return hashRiverStableValue(profile);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
  return Object.freeze(value);
}
