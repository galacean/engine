/** Pure-data field dependency contract for opt-in Water Surface V2 capabilities. */

export enum WaterSurfaceFieldSchemaVersion {
  V2 = 2
}

export enum WaterFieldSemantic {
  Coverage = "coverage",
  SurfaceHeight = "surface-height",
  VerticalDepth = "vertical-depth",
  HorizontalShoreDistance = "horizontal-shore-distance",
  /** Positive linear camera-Z difference, in metres; retained for explicit artistic responses. */
  SceneEyeDepth = "scene-eye-depth",
  /** Distance travelled from the water surface along the viewing ray, in metres. */
  SceneRayDepth = "scene-ray-depth",
  SurfaceNormalDepth = "surface-normal-depth",
  OpticalPath = "optical-path",
  ObstacleContact = "obstacle-contact",
  Flow = "flow",
  SceneColor = "scene-color"
}

export enum WaterFieldProviderKind {
  CompiledSpatialField = "compiled-spatial-field",
  CameraDepth = "camera-depth",
  CameraOpaqueColor = "camera-opaque-color",
  Derived = "derived",
  Constant = "constant"
}

export enum WaterFieldRequirement {
  Required = "required",
  Optional = "optional"
}

/** Explicit runtime feature gate for a field consumer. */
export enum WaterFieldConsumerActivation {
  Always = "always",
  RefractionEnabled = "refraction-enabled",
  DepthTintEnabled = "depth-tint-enabled",
  CoastalAlphaEnabled = "coastal-alpha-enabled",
  ContactFoamEnabled = "contact-foam-enabled",
  ReflectionEnabled = "reflection-enabled",
  CausticsEnabled = "caustics-enabled"
}

export enum WaterFieldFallback {
  DisableEffect = "disable-effect",
  UseNextProvider = "use-next-provider",
  FailActivation = "fail-activation"
}

export enum WaterFieldUnit {
  Meter = "meter",
  Normalized = "normalized",
  MeterPerSecond = "meter-per-second",
  LinearRgb = "linear-rgb"
}

export interface WaterSurfaceFieldDependencyV2 {
  /** Stable effect/closure id; multiple consumers may request the same semantic independently. */
  readonly consumerId: string;
  readonly semantic: WaterFieldSemantic;
  /** Ordered provider preference. Order is semantic and enters the content hash. */
  readonly providers: readonly WaterFieldProviderKind[];
  readonly activation: WaterFieldConsumerActivation;
  readonly requirement: WaterFieldRequirement;
  readonly fallback: WaterFieldFallback;
  readonly unit: WaterFieldUnit;
}

export interface WaterSurfaceFieldDependencyAssetV2 {
  readonly schemaVersion: WaterSurfaceFieldSchemaVersion.V2;
  readonly id: string;
  readonly bindings: readonly WaterSurfaceFieldDependencyV2[];
}

export enum WaterSurfaceFieldDiagnosticSeverity {
  Error = "error"
}

export enum WaterSurfaceFieldDiagnosticCode {
  InvalidRootType = "WATER_SURFACE_FIELD_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "WATER_SURFACE_FIELD_UNSUPPORTED_SCHEMA_VERSION",
  InvalidIdentifier = "WATER_SURFACE_FIELD_INVALID_IDENTIFIER",
  MissingField = "WATER_SURFACE_FIELD_MISSING_FIELD",
  InvalidType = "WATER_SURFACE_FIELD_INVALID_TYPE",
  InvalidEnum = "WATER_SURFACE_FIELD_INVALID_ENUM",
  DuplicateConsumer = "WATER_SURFACE_FIELD_DUPLICATE_CONSUMER",
  DuplicateProvider = "WATER_SURFACE_FIELD_DUPLICATE_PROVIDER",
  ProviderSemanticMismatch = "WATER_SURFACE_FIELD_PROVIDER_SEMANTIC_MISMATCH",
  UnitSemanticMismatch = "WATER_SURFACE_FIELD_UNIT_SEMANTIC_MISMATCH",
  InvalidFallback = "WATER_SURFACE_FIELD_INVALID_FALLBACK",
  DerivedDependencyCycle = "WATER_SURFACE_FIELD_DERIVED_DEPENDENCY_CYCLE",
  MissingDerivedInput = "WATER_SURFACE_FIELD_MISSING_DERIVED_INPUT"
}

export interface WaterSurfaceFieldDiagnostic {
  readonly code: WaterSurfaceFieldDiagnosticCode;
  readonly severity: WaterSurfaceFieldDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface WaterSurfaceFieldValidationResult {
  readonly valid: boolean;
  readonly value?: WaterSurfaceFieldDependencyAssetV2;
  readonly diagnostics: readonly WaterSurfaceFieldDiagnostic[];
}
