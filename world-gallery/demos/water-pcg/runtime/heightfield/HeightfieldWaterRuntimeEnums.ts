/** Debug outputs exposed by the heightfield-water surface shader. */
export enum HeightfieldWaterDebugMode {
  Final = 0,
  BaseHeight = 1,
  BaseNormal = 2,
  SignedDistance = 3,
  Depth = 4,
  Flow = 5,
  WaveDisplacement = 6,
  CenteredOpaqueColor = 7,
  DisplacedOpaqueColor = 8,
  RefractionUvDelta = 9,
  OpticalDepth = 10,
  DepthContinuity = 11,
  SampleValidity = 12,
  Fresnel = 13,
  ShaderCompositedColor = 14,
  SurfaceAlpha = 15,
  ReflectionSource = 16,
  PlanarUv = 17,
  ClipSide = 18,
  RefractionAmount = 19,
  RefractionGates = 20,
  ReflectionColor = 21,
  NormalDotView = 22
}

/** Stable output labels used by optics captures and CPU/framebuffer analysis. */
export enum HeightfieldWaterOpticsDebugOutput {
  CenteredOpaqueColor = "centered-opaque-color",
  DisplacedOpaqueColor = "displaced-opaque-color",
  RefractionUvDelta = "refraction-uv-delta",
  OpticalDepth = "optical-depth",
  DepthContinuity = "depth-continuity",
  SampleValidity = "sample-validity",
  Fresnel = "fresnel",
  ShaderCompositedColor = "shader-composited-color",
  SurfaceAlpha = "surface-alpha",
  ReflectionSource = "reflection-source",
  PlanarUv = "planar-uv",
  ClipSide = "clip-side",
  RefractionAmount = "refraction-amount",
  RefractionGates = "refraction-gates",
  ReflectionColor = "reflection-color",
  NormalDotView = "normal-dot-view",
  /** External capture label: the final framebuffer cannot be sampled from this surface shader. */
  FinalFramebufferColor = "final-framebuffer-color"
}

/** Maps shader-readable capture labels to their stable material debug value. */
export const HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT: Readonly<
  Partial<Record<HeightfieldWaterOpticsDebugOutput, HeightfieldWaterDebugMode>>
> = Object.freeze({
  [HeightfieldWaterOpticsDebugOutput.CenteredOpaqueColor]: HeightfieldWaterDebugMode.CenteredOpaqueColor,
  [HeightfieldWaterOpticsDebugOutput.DisplacedOpaqueColor]: HeightfieldWaterDebugMode.DisplacedOpaqueColor,
  [HeightfieldWaterOpticsDebugOutput.RefractionUvDelta]: HeightfieldWaterDebugMode.RefractionUvDelta,
  [HeightfieldWaterOpticsDebugOutput.OpticalDepth]: HeightfieldWaterDebugMode.OpticalDepth,
  [HeightfieldWaterOpticsDebugOutput.DepthContinuity]: HeightfieldWaterDebugMode.DepthContinuity,
  [HeightfieldWaterOpticsDebugOutput.SampleValidity]: HeightfieldWaterDebugMode.SampleValidity,
  [HeightfieldWaterOpticsDebugOutput.Fresnel]: HeightfieldWaterDebugMode.Fresnel,
  [HeightfieldWaterOpticsDebugOutput.ShaderCompositedColor]: HeightfieldWaterDebugMode.ShaderCompositedColor,
  [HeightfieldWaterOpticsDebugOutput.SurfaceAlpha]: HeightfieldWaterDebugMode.SurfaceAlpha,
  [HeightfieldWaterOpticsDebugOutput.ReflectionSource]: HeightfieldWaterDebugMode.ReflectionSource,
  [HeightfieldWaterOpticsDebugOutput.PlanarUv]: HeightfieldWaterDebugMode.PlanarUv,
  [HeightfieldWaterOpticsDebugOutput.ClipSide]: HeightfieldWaterDebugMode.ClipSide,
  [HeightfieldWaterOpticsDebugOutput.RefractionAmount]: HeightfieldWaterDebugMode.RefractionAmount,
  [HeightfieldWaterOpticsDebugOutput.RefractionGates]: HeightfieldWaterDebugMode.RefractionGates,
  [HeightfieldWaterOpticsDebugOutput.ReflectionColor]: HeightfieldWaterDebugMode.ReflectionColor,
  [HeightfieldWaterOpticsDebugOutput.NormalDotView]: HeightfieldWaterDebugMode.NormalDotView
});

/** Surface composition path. Numeric values are shader ABI and must remain stable. */
export enum HeightfieldWaterCompositionMode {
  LegacyAlpha = 0,
  PrecomposedReplace = 1
}

/** Calibration-only optics path. Numeric values are shader ABI and must remain stable. */
export enum HeightfieldWaterOpticsCalibrationMode {
  None = 0,
  CpuReference = 1,
  PureTransmission = 2
}
