/** Stable vocabulary accepted by river authoring descriptors. */
export enum RiverPathMode {
  Polyline = "polyline",
  CatmullRom = "catmullRom",
  Bezier = "bezier",
  /** Linear XZ footprint with a slope-continuous, non-overshooting elevation profile. */
  MonotoneElevation = "monotoneElevation"
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
  High = "high"
}

export enum RiverNetworkSchemaVersion {
  V2 = 2
}

export enum RiverNodeKind {
  Source = "source",
  Confluence = "confluence",
  Mouth = "mouth",
  Bifurcation = "bifurcation"
}

export enum RiverDisturbanceKind {
  Obstacle = "obstacle"
}
