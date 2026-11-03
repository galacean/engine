/**
 * Pipeline stage.
 */
export enum PipelineStage {
  /** DepthOnly stage. */
  DepthOnly = "DepthOnly",
  /** Shadow caster stage. */
  ShadowCaster = "ShadowCaster",
  /** Screen-space reflection receiver surface stage. */
  ScreenSpaceReflectionSurface = "ScreenSpaceReflectionSurface",
  /** Forward shading stage. */
  Forward = "Forward"
}
