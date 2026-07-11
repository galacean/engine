/**
 * Shared river-system constants and enumerations.
 *
 * This file centralizes every constrained option and numeric guardrail used by the
 * river prototype: path modes, material presets, quality levels, debug modes,
 * validator limits, shader property names, and mesh offsets. Keeping these values
 * here avoids magic strings and scattered tuning numbers, which is important for a
 * future engine-level water API where config validation, GUI controls, shader
 * binding, and mesh generation must all agree on the same vocabulary.
 */
export enum RiverPathMode {
  Polyline = "polyline",
  CatmullRom = "catmullRom",
  Bezier = "bezier"
}

export enum RiverDirectionMode {
  PathOrder = "pathOrder",
  Downstream = "downstream"
}

export enum RiverMaterialPreset {
  ClearStream = "clearStream",
  MuddyRiver = "muddyRiver",
  MountainCreek = "mountainCreek"
}

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

export enum RiverQualityLevel {
  Low = "low",
  Medium = "medium",
  High = "high"
}

export enum RiverValidationMode {
  Strict = "strict",
  PreviewRepair = "previewRepair"
}

export enum RiverNetworkSchemaVersion {
  V1 = 1
}

export enum RiverDiagnosticSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error"
}

export enum RiverDiagnosticCode {
  InvalidRootType = "RIVER_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "RIVER_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "RIVER_MISSING_FIELD",
  InvalidType = "RIVER_INVALID_TYPE",
  InvalidNumber = "RIVER_INVALID_NUMBER",
  InvalidEnum = "RIVER_INVALID_ENUM",
  DuplicateId = "RIVER_DUPLICATE_ID",
  ValueOutOfRange = "RIVER_VALUE_OUT_OF_RANGE",
  ControlPointLimitExceeded = "RIVER_CONTROL_POINT_LIMIT_EXCEEDED",
  ControlPointRepaired = "RIVER_CONTROL_POINT_REPAIRED",
  DegenerateControlPoint = "RIVER_DEGENERATE_CONTROL_POINT",
  SamplingBudgetRedistributed = "RIVER_SAMPLING_BUDGET_REDISTRIBUTED",
  SamplingBudgetBelowAnchorCount = "RIVER_SAMPLING_BUDGET_BELOW_ANCHOR_COUNT",
  ShortRiver = "RIVER_SHORT_LENGTH",
  MissingNodeReference = "RIVER_MISSING_NODE_REFERENCE",
  SegmentEndpointMismatch = "RIVER_SEGMENT_ENDPOINT_MISMATCH",
  NetworkCycle = "RIVER_NETWORK_CYCLE",
  DisconnectedNetwork = "RIVER_DISCONNECTED_NETWORK",
  InvalidNodeDegree = "RIVER_INVALID_NODE_DEGREE",
  ReversedElevation = "RIVER_REVERSED_ELEVATION",
  WaterProfileAdjusted = "RIVER_WATER_PROFILE_ADJUSTED",
  InvalidMergeRadius = "RIVER_INVALID_MERGE_RADIUS",
  NetworkBudgetExceeded = "RIVER_NETWORK_BUDGET_EXCEEDED",
  NetworkBudgetRedistributed = "RIVER_NETWORK_BUDGET_REDISTRIBUTED"
}

export enum RiverDirtyFlag {
  None = 0,
  Topology = 1 << 0,
  Geometry = 1 << 1,
  Material = 1 << 2,
  Query = 1 << 3,
  Debug = 1 << 4,
  All = Topology | Geometry | Material | Query | Debug
}

export enum RiverDebugMode {
  Off = "off",
  Path = "path",
  Banks = "banks",
  Full = "full"
}

export enum RiverPreviewStage {
  Path = "path",
  Banks = "banks",
  Mesh = "mesh",
  Material = "material",
  Full = "full"
}

export enum RiverNodeKind {
  Source = "source",
  Confluence = "confluence",
  Mouth = "mouth",
  Bifurcation = "bifurcation"
}

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

export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture"
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

export const RIVER_MESH_OFFSET = {
  surface: 0.04,
  bankFoam: 0.02,
  debug: 0.16
} as const;

/** World-distance to longitudinal UV scale shared by every reach in a compiled network. */
export const RIVER_FLOW_UV_SCALE = 0.08;

export const RIVER_PREVIEW_STAGE_COLOR = {
  meshSurface: "#6bc6ff",
  meshBankFoam: "#f0fbff"
} as const;
