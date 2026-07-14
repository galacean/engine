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
  maxPointCount: 32,
  minSegmentLength: 0.5,
  maxSegmentLength: 10,
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
  maxSegmentCount: 2048,
  minChordError: 0.01,
  maxChordError: 2,
  maxNetworkSegmentCount: 256,
  maxNetworkSampleCount: 32768,
  maxNetworkVertexCount: 131072,
  maxNetworkChunkCount: 256,
  maxNetworkMapPixelCount: 4194304,
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
  [RiverQualityLevel.Low]: {
    segmentLength: 3.5,
    maxSegmentCount: 180,
    maxChordError: 0.6
  },
  [RiverQualityLevel.Medium]: {
    segmentLength: 1.8,
    maxSegmentCount: 512,
    maxChordError: 0.25
  },
  [RiverQualityLevel.High]: {
    segmentLength: 1,
    maxSegmentCount: 1024,
    maxChordError: 0.1
  }
} as const;

/** V1 derives one continuous network surface from material style and material quality. */
export const RIVER_SURFACE_MOTION_STYLE_PRESET = {
  [RiverMaterialPreset.ClearStream]: {
    displacementAmplitude: 0.16,
    displacementLengthScale: 4.8,
    shoreDampingWidth: 1.1,
    turbulence: 0.72,
    crestIntensity: 0.78,
    microNormalStrength: 0.34
  },
  [RiverMaterialPreset.MuddyRiver]: {
    displacementAmplitude: 0.11,
    displacementLengthScale: 6.4,
    shoreDampingWidth: 1.5,
    turbulence: 0.48,
    crestIntensity: 0.5,
    microNormalStrength: 0.22
  },
  [RiverMaterialPreset.MountainCreek]: {
    displacementAmplitude: 0.23,
    displacementLengthScale: 3.6,
    shoreDampingWidth: 0.9,
    turbulence: 0.96,
    crestIntensity: 1.08,
    microNormalStrength: 0.46
  }
} as const;

export const RIVER_SURFACE_MOTION_QUALITY_SCALE = {
  [RiverQualityLevel.Low]: {
    displacement: 0,
    turbulence: 0.55,
    crest: 0.55,
    microNormal: 0.45
  },
  [RiverQualityLevel.Medium]: {
    displacement: 1,
    turbulence: 1,
    crest: 1,
    microNormal: 1
  },
  [RiverQualityLevel.High]: {
    displacement: 1.18,
    turbulence: 1.12,
    crest: 1.16,
    microNormal: 1.22
  }
} as const;
