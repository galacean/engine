/** Stable vocabulary accepted by river authoring descriptors. */
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

export enum RiverValidationMode {
  Strict = "strict",
  PreviewRepair = "previewRepair"
}

export enum RiverNetworkSchemaVersion {
  V1 = 1
}

export enum RiverNodeKind {
  Source = "source",
  Confluence = "confluence",
  Mouth = "mouth",
  Bifurcation = "bifurcation"
}
