/** Versioned pure-data contracts for opt-in water surface appearance. */
export enum WaterSurfaceAppearanceSchemaVersion {
  V1 = 1
}

export enum WaterSurfaceNormalModel {
  ProceduralSlope = "procedural-slope",
  ExternalTangentNormal = "external-tangent-normal"
}

export enum WaterSurfaceNormalSampling {
  WorldXzMirroredDual = "world-xz-mirrored-dual"
}

export enum WaterSurfaceDepthTintModel {
  BeerLambert = "beer-lambert",
  SceneDepthPower = "scene-depth-power"
}

export enum WaterSurfaceCoastalAlphaModel {
  LegacyCoverage = "legacy-coverage",
  SceneDepth = "scene-depth"
}

export enum WaterSurfaceContactFoamModel {
  None = "none",
  SceneDepthVoronoi = "scene-depth-voronoi"
}

export enum WaterSurfaceAppearanceDiagnosticSeverity {
  Error = "error"
}

export enum WaterSurfaceAppearanceDiagnosticCode {
  InvalidRootType = "WATER_SURFACE_APPEARANCE_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "WATER_SURFACE_APPEARANCE_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "WATER_SURFACE_APPEARANCE_MISSING_FIELD",
  InvalidType = "WATER_SURFACE_APPEARANCE_INVALID_TYPE",
  InvalidNumber = "WATER_SURFACE_APPEARANCE_INVALID_NUMBER",
  InvalidEnum = "WATER_SURFACE_APPEARANCE_INVALID_ENUM",
  InvalidIdentifier = "WATER_SURFACE_APPEARANCE_INVALID_IDENTIFIER",
  InvalidContentHash = "WATER_SURFACE_APPEARANCE_INVALID_CONTENT_HASH",
  ValueOutOfRange = "WATER_SURFACE_APPEARANCE_VALUE_OUT_OF_RANGE",
  TupleLengthMismatch = "WATER_SURFACE_APPEARANCE_TUPLE_LENGTH_MISMATCH"
}

export type WaterSurfaceAppearanceColor = readonly [number, number, number, number];

export interface WaterSurfaceProceduralSlopeNormal {
  readonly model: WaterSurfaceNormalModel.ProceduralSlope;
}

export interface WaterSurfaceExternalTangentNormal {
  readonly model: WaterSurfaceNormalModel.ExternalTangentNormal;
  readonly textureAssetId: string;
  readonly textureContentHash: string;
  readonly sampling: WaterSurfaceNormalSampling.WorldXzMirroredDual;
  readonly tiling: number;
  readonly scrollUvPerSecond: number;
  readonly strength: number;
  readonly flipGreen: boolean;
}

export type WaterSurfaceNormalAppearance =
  | WaterSurfaceProceduralSlopeNormal
  | WaterSurfaceExternalTangentNormal;

export interface WaterSurfaceBeerLambertDepthTint {
  readonly model: WaterSurfaceDepthTintModel.BeerLambert;
}

export interface WaterSurfaceSceneDepthPowerTint {
  readonly model: WaterSurfaceDepthTintModel.SceneDepthPower;
  readonly color: WaterSurfaceAppearanceColor;
  readonly distance: number;
  readonly exponent: number;
}

export type WaterSurfaceDepthTintAppearance =
  | WaterSurfaceBeerLambertDepthTint
  | WaterSurfaceSceneDepthPowerTint;

export interface WaterSurfaceLegacyCoverageAlpha {
  readonly model: WaterSurfaceCoastalAlphaModel.LegacyCoverage;
}

export interface WaterSurfaceSceneDepthAlpha {
  readonly model: WaterSurfaceCoastalAlphaModel.SceneDepth;
  readonly distance: number;
}

export type WaterSurfaceCoastalAlphaAppearance =
  | WaterSurfaceLegacyCoverageAlpha
  | WaterSurfaceSceneDepthAlpha;

export interface WaterSurfaceFoamOctaves1 {
  readonly count: 1;
  readonly weights: readonly [number];
}

export interface WaterSurfaceFoamOctaves2 {
  readonly count: 2;
  readonly weights: readonly [number, number];
}

export interface WaterSurfaceFoamOctaves3 {
  readonly count: 3;
  readonly weights: readonly [number, number, number];
}

export type WaterSurfaceFoamOctaves =
  | WaterSurfaceFoamOctaves1
  | WaterSurfaceFoamOctaves2
  | WaterSurfaceFoamOctaves3;

export interface WaterSurfaceNoContactFoam {
  readonly model: WaterSurfaceContactFoamModel.None;
}

export interface WaterSurfaceSceneDepthVoronoiFoam {
  readonly model: WaterSurfaceContactFoamModel.SceneDepthVoronoi;
  readonly worldScale: number;
  readonly timeRate: number;
  readonly opacity: number;
  readonly contactDistance: number;
  readonly octaves: WaterSurfaceFoamOctaves;
  readonly lacunarity: number;
  readonly suppressRefraction: number;
  readonly smoothnessReduction: number;
}

export type WaterSurfaceContactFoamAppearance =
  | WaterSurfaceNoContactFoam
  | WaterSurfaceSceneDepthVoronoiFoam;

export interface WaterSurfaceAppearanceAssetV1 {
  readonly schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1;
  readonly id: string;
  readonly normal: WaterSurfaceNormalAppearance;
  readonly depthTint: WaterSurfaceDepthTintAppearance;
  readonly coastalAlpha: WaterSurfaceCoastalAlphaAppearance;
  readonly contactFoam: WaterSurfaceContactFoamAppearance;
}

export interface WaterSurfaceAppearanceDiagnostic {
  readonly code: WaterSurfaceAppearanceDiagnosticCode;
  readonly severity: WaterSurfaceAppearanceDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface WaterSurfaceAppearanceValidationResult {
  readonly valid: boolean;
  readonly value?: WaterSurfaceAppearanceAssetV1;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}
