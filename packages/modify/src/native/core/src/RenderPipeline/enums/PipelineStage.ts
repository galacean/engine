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
  /** Transparent contribution color using the material Forward depth and blend settings. */
  ScreenSpaceReflectionContributionColor = "ScreenSpaceReflectionContributionColor",
  /** Nearest nonzero-alpha transparent contribution depth. */
  ScreenSpaceReflectionContributionDepth = "ScreenSpaceReflectionContributionDepth",
  /** Forward shading stage. */
  Forward = "Forward"
}
