/** Schema guardrails and authoring presets shared by decoder and tools. */
import { RiverMaterialPreset, RiverQualityLevel } from "./RiverAuthoringEnums";

export const RIVER_MATERIAL_PRESET_CONFIG = {
  [RiverMaterialPreset.ClearStream]: {
    baseColor: "#123aa6",
    foamColor: "#d6edf3",
    foamIntensity: 0.86,
    clarity: 0.54
  },
  [RiverMaterialPreset.MuddyRiver]: {
    baseColor: "#526b5a",
    foamColor: "#d8d3bd",
    foamIntensity: 0.55,
    clarity: 0.2
  },
  [RiverMaterialPreset.MountainCreek]: {
    baseColor: "#006bd8",
    foamColor: "#e8fbff",
    foamIntensity: 0.92,
    clarity: 0.82
  }
} as const;

export const RIVER_LIMITS = {
  minPointCount: 2,
  minWidth: 1,
  maxWidth: 50,
  minDepth: 0,
  maxDepth: 10,
  minBankFeather: 0,
  maxBankFeather: 10,
  minFlowSpeed: 0,
  maxFlowSpeed: 10,
  minFoamIntensity: 0,
  maxFoamIntensity: 1,
  minClarity: 0,
  maxClarity: 1,
  maxChunkVertexCount: 65535,
  minRiverLengthFactor: 2,
  minSurfaceSeed: 0,
  maxSurfaceSeed: 65535,
  minDisplacementAmplitude: 0,
  maxDisplacementAmplitude: 1.5,
  minDisplacementLengthScale: 0.5,
  maxDisplacementLengthScale: 30,
  minShoreDampingWidth: 0.05,
  maxShoreDampingWidth: 10,
  minSurfaceTurbulence: 0,
  maxSurfaceTurbulence: 2,
  minCrestIntensity: 0,
  maxCrestIntensity: 2,
  minMicroNormalStrength: 0,
  maxMicroNormalStrength: 2,
  minDisturbanceRadius: 0.1,
  maxDisturbanceRadius: 20,
  minDisturbanceStrength: 0,
  maxDisturbanceStrength: 2,
  maxDisturbanceCount: 128
} as const;

export const RIVER_QUALITY_PRESET = {
  [RiverQualityLevel.High]: {
    segmentLength: 1,
    maxChordError: 0.1
  }
} as const;
