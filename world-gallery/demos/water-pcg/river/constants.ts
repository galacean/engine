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

export enum RiverQualityLevel {
  Low = "low",
  Medium = "medium",
  High = "high"
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
  minRiverLengthFactor: 2
} as const;

export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeed: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  time: "material_Time"
} as const;

export const RIVER_MESH_OFFSET = {
  surface: 0.04,
  bankFoam: 0.02,
  debug: 0.16
} as const;

export const RIVER_PREVIEW_STAGE_COLOR = {
  meshSurface: "#6bc6ff",
  meshBankFoam: "#f0fbff"
} as const;
