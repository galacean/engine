/** Versioned pure-data contracts for opt-in water surface appearance. */
import { WaterFieldSemantic } from "./WaterSurfaceFieldTypes";

export enum WaterSurfaceAppearanceSchemaVersion {
  V2 = 2
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

export type WaterSurfaceFoamOctaves = WaterSurfaceFoamOctaves1 | WaterSurfaceFoamOctaves2 | WaterSurfaceFoamOctaves3;

/** Compile-time bounded detail-layer source. */
export enum WaterSurfaceDetailSource {
  NormalTexture = "normal-texture",
  ProceduralSlope = "procedural-slope"
}

export enum WaterSurfaceDetailSpace {
  WorldXz = "world-xz",
  ObjectXz = "object-xz",
  MeshUv = "mesh-uv",
  FlowAdvected = "flow-advected"
}

export enum WaterSurfaceNormalConvention {
  OpenGl = "opengl",
  DirectX = "directx"
}

/** Structural interpretation of a detail layer's scalar normal strength. */
export enum WaterSurfaceNormalStrengthModeV2 {
  /** Reconstruct Z after scaling XY, then normalize the layer before blending. */
  ReconstructAfterScale = "reconstruct-after-scale",
  /** Preserve source Z, scale XY, and lerp Z toward flat before the blend normalizes. */
  PreserveSourceZ = "preserve-source-z"
}

export enum WaterSurfaceDetailBlend {
  Whiteout = "whiteout",
  /** Partial-derivative blend: xy = n1.xy*n2.z + n2.xy*n1.z, z = n1.z*n2.z. */
  PartialDerivative = "partial-derivative",
  Reoriented = "reoriented",
  AddSlope = "add-slope"
}

export interface WaterSurfaceDetailLayerV2 {
  readonly id: string;
  readonly source: WaterSurfaceDetailSource;
  readonly textureAssetId?: string;
  readonly textureContentHash?: string;
  readonly space: WaterSurfaceDetailSpace;
  readonly scale: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly rotationDegrees: number;
  readonly strength: number;
  readonly normalConvention: WaterSurfaceNormalConvention;
  readonly strengthMode: WaterSurfaceNormalStrengthModeV2;
  readonly blend: WaterSurfaceDetailBlend;
}

export enum WaterSurfacePrimaryColorClosure {
  PhysicalVolume = "physical-volume",
  /** Refracted scene and depth tint form albedo together, before diffuse lighting. */
  RefractedAlbedoDepthRamp = "refracted-albedo-depth-ramp",
  StylizedDepthRamp = "stylized-depth-ramp",
  /** Treat Scene Color as pre-lit transmission while Water-owned tint still receives diffuse lighting. */
  LitSceneColorDepthRamp = "lit-scene-color-depth-ramp",
  /**
   * Resolve a shallow/deep Water albedo first, then composite the complete lit
   * Water layer over Scene Color with the same depth response. This is the
   * shared closure for refractive stylized water whose opacity is depth-owned.
   */
  SceneColorCompositeDepthRamp = "scene-color-composite-depth-ramp"
}

/** Bounded directional-light highlight models owned by the shared Surface Appearance closure. */
export enum WaterSurfaceDirectionalHighlightModelV2 {
  BlinnPhongPerturbed = "blinn-phong-perturbed"
}

/**
 * Stylized directional highlight expressed without backend- or vendor-specific names.
 * The geometry adapter supplies macro/detail normals; this contract only owns the response.
 */
export interface WaterSurfaceDirectionalHighlightV2 {
  readonly model: WaterSurfaceDirectionalHighlightModelV2.BlinnPhongPerturbed;
  readonly strength: number;
  readonly exponent: number;
  readonly distortion: number;
  readonly sharp: boolean;
}

export enum WaterSurfaceDepthResponseModelV2 {
  BeerLambert = "beer-lambert",
  PowerRamp = "power-ramp",
  ColorRamp = "color-ramp",
  LinearColorOpacity = "linear-color-opacity",
  CompositeExponential = "composite-exponential"
}

export enum WaterDepthResponseCombineV2 {
  Maximum = "maximum"
}

export interface WaterExponentialDepthTermV2 {
  readonly field:
    | WaterFieldSemantic.SceneEyeDepth
    | WaterFieldSemantic.SceneRayDepth
    | WaterFieldSemantic.SurfaceNormalDepth
    | WaterFieldSemantic.VerticalDepth;
  readonly coefficientPerMeter: number;
}

export interface WaterSurfaceCompositeExponentialDepthResponseV2 {
  readonly model: WaterSurfaceDepthResponseModelV2.CompositeExponential;
  readonly terms: readonly [WaterExponentialDepthTermV2, WaterExponentialDepthTermV2?];
  readonly combine: WaterDepthResponseCombineV2.Maximum;
  readonly shallowColor: WaterSurfaceAppearanceColor;
  readonly deepColor: WaterSurfaceAppearanceColor;
}

export interface WaterSurfaceColorStopV2 {
  /** Normalized response position in [0, 1]. */
  readonly position: number;
  readonly color: WaterSurfaceAppearanceColor;
}

export interface WaterSurfaceBeerLambertDepthResponseV2 {
  readonly model: WaterSurfaceDepthResponseModelV2.BeerLambert;
  readonly field: WaterFieldSemantic.OpticalPath;
  /** Artistic tint of the new medium's in-scattered radiance only; never scene transmission or alpha. */
  readonly scatteringTint?: {
    readonly coefficientPerMeter: number;
    readonly shallowColor: WaterSurfaceAppearanceColor;
    readonly deepColor: WaterSurfaceAppearanceColor;
  };
}

export interface WaterSurfacePowerRampDepthResponseV2 {
  readonly model: WaterSurfaceDepthResponseModelV2.PowerRamp;
  readonly field: WaterFieldSemantic;
  readonly distanceMeters: number;
  readonly exponent: number;
  readonly color: WaterSurfaceAppearanceColor;
}

export interface WaterSurfaceColorRampDepthResponseV2 {
  readonly model: WaterSurfaceDepthResponseModelV2.ColorRamp;
  readonly field: WaterFieldSemantic;
  readonly distanceMeters: number;
  readonly colors: readonly WaterSurfaceColorStopV2[];
}

/** Independent linear tint and opacity ramps; all coefficients are per metre. */
export interface WaterSurfaceLinearColorOpacityV2 {
  readonly model: WaterSurfaceDepthResponseModelV2.LinearColorOpacity;
  readonly field: WaterFieldSemantic;
  readonly colorCoefficientPerMeter: number;
  readonly opacityCoefficientPerMeter: number;
  readonly maximumOpacity: number;
  readonly shallowColor: WaterSurfaceAppearanceColor;
  readonly deepColor: WaterSurfaceAppearanceColor;
}

export type WaterSurfaceDepthResponseV2 =
  | WaterSurfaceLinearColorOpacityV2
  | WaterSurfaceBeerLambertDepthResponseV2
  | WaterSurfacePowerRampDepthResponseV2
  | WaterSurfaceColorRampDepthResponseV2
  | WaterSurfaceCompositeExponentialDepthResponseV2;

export enum WaterBoundaryResponseV2 {
  Linear = "linear",
  Smoothstep = "smoothstep",
  Power = "power"
}

export enum WaterPatternModelV2 {
  /** Stable polynomial-hash Voronoi suited to cross-platform deterministic masks. */
  Voronoi = "voronoi",
  /** Animated F1 Voronoi cells for authored, organic boundary patterns. */
  AnimatedVoronoiF1 = "animated-voronoi-f1",
  /** Contour-parallel traveling bands driven by signed shoreline distance. */
  ShorelineBreakerBand = "shoreline-breaker-band"
}

export enum WaterPatternResponseV2 {
  Linear = "linear",
  Power = "power"
}

/** Bounded ways to combine an independently evaluated pattern with a boundary response. */
export enum WaterPatternBoundaryCombineV2 {
  Multiply = "multiply",
  AddSaturate = "add-saturate",
  /**
   * Keeps an inverted linear boundary response signed until after the pattern
   * is added. This lets the metric distance attenuate a procedural boundary
   * beyond its nominal range before the final result is saturated.
   */
  SignedBoundaryAddSaturate = "signed-boundary-add-saturate"
}

export interface WaterPatternV2 {
  readonly model: WaterPatternModelV2;
  readonly worldScale: number;
  readonly timeRate: number;
  readonly opacity: number;
  readonly octaves: WaterSurfaceFoamOctaves;
  readonly lacunarity: number;
  /** Shapes the pattern independently from the meter-valued boundary response. */
  readonly response: WaterPatternResponseV2;
  readonly invert: boolean;
  readonly exponent?: number;
  readonly combine: WaterPatternBoundaryCombineV2;
}

export interface WaterBoundaryOutputsV2 {
  /** Blends the material alpha toward the evaluated mask. */
  readonly alpha?: number;
  /** Linear additive boundary color, normally foam. */
  readonly color?: readonly [number, number, number];
  /** Albedo mixes into depth tint and increases its opacity; additive preserves the legacy response. */
  readonly colorMode?: "additive" | "albedo";
  readonly roughness?: number;
  readonly refractionSuppression?: number;
}

export interface WaterBoundaryEffectV2 {
  readonly id: string;
  readonly field: WaterFieldSemantic;
  readonly response: WaterBoundaryResponseV2;
  readonly rangeMeters: number;
  /** Inverts the increasing field response, for near-contact effects. */
  readonly invert: boolean;
  readonly exponent?: number;
  readonly pattern?: WaterPatternV2;
  readonly outputs: WaterBoundaryOutputsV2;
}

export enum WaterRefractionValidationModeV2 {
  FullSceneDepth = "full-scene-depth",
  /** Accept an in-bounds shifted sample when its geometry remains behind the water surface. */
  ShiftedSceneDepth = "shifted-scene-depth",
  LocalOnlySafe = "local-only-safe"
}

export enum WaterRefractionNormalSourceV2 {
  /** Camera-relative delta between the perturbed and macro surface normals. */
  ViewSpaceDelta = "view-space-delta",
  /** Detail tangent-normal XY used directly as a stylized screen-space offset. */
  TangentSpace = "tangent-space",
  /** First detail layer, before post-blend lighting normal attenuation. */
  FirstDetailLayer = "first-detail-layer"
}

export interface WaterRefractionV2 {
  /** Compiled shader/field capability. The live requested gate is WaterOpticsPresetV1.refractionEnabled. */
  readonly enabled: boolean;
  /** Screen UV displacement multiplier; deliberately not a world-space distance. */
  readonly uvScale: number;
  readonly normalSource: WaterRefractionNormalSourceV2;
  readonly validation: WaterRefractionValidationModeV2;
}

export enum WaterSurfaceCompositionV2 {
  AlphaBlend = "alpha-blend",
  PrecomposedReplace = "precomposed-replace"
}

/**
 * Opt-in composable surface closure. Structural choices are compiled into a
 * finite variant; numeric art values remain uniforms.
 */
/** Animated color projection, added to water albedo. Does not change physical depth. */
export interface WaterSurfaceCausticsV2 {
  readonly id: string;
  readonly textureAssetId: string;
  readonly textureContentHash: string;
  readonly scale: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly intensity: number;
  readonly distortion: number;
  readonly parallaxOffset: number;
  readonly parallaxBias: number;
  readonly fadeCoefficientPerMeter: number;
  readonly opacityContribution: number;
}

export interface WaterSurfaceAppearanceAssetV2 {
  readonly schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2;
  readonly id: string;
  readonly primaryColorClosure: WaterSurfacePrimaryColorClosure;
  /** Visual-only amplification of macro-normal slopes; geometry and query normals remain unchanged. */
  readonly macroNormalStrength?: number;
  /** River flow-texture normal strength; independent of macro geometry and detail layers. */
  readonly flowNormalStrength?: number;
  /** Strength applied after blending detail normals, independently of refraction. */
  readonly detailNormalStrength?: number;
  readonly caustics?: WaterSurfaceCausticsV2;
  readonly directionalHighlight?: WaterSurfaceDirectionalHighlightV2;
  readonly detailLayers: readonly WaterSurfaceDetailLayerV2[];
  readonly depthResponse: WaterSurfaceDepthResponseV2;
  readonly boundaryEffects: readonly WaterBoundaryEffectV2[];
  readonly refraction: WaterRefractionV2;
  readonly composition: WaterSurfaceCompositionV2;
}

export type WaterSurfaceAppearanceAsset = WaterSurfaceAppearanceAssetV2;

export interface WaterSurfaceAppearanceDiagnostic {
  readonly code: WaterSurfaceAppearanceDiagnosticCode;
  readonly severity: WaterSurfaceAppearanceDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface WaterSurfaceAppearanceValidationResult {
  readonly valid: boolean;
  readonly value?: WaterSurfaceAppearanceAsset;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}
