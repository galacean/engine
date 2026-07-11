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
  minRiverLengthFactor: 2
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
