/**
 * Pipeline stage.
 */
export enum PipelineStage {
  /** DepthOnly stage. */
  DepthOnly = "DepthOnly",
  /** Shadow caster stage. */
  ShadowCaster = "ShadowCaster",
  /** Screen-space reflection receiver stage. */
  SSRReceiver = "SSRReceiver",
  /** Optional nearest nonzero-alpha transparent depth contribution stage for SSR. */
  SSRContributionDepth = "SSRContributionDepth",
  /** Forward shading stage. */
  Forward = "Forward"
}
