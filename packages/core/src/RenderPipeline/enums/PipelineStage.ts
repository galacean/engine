export enum PipelineStage {
  /** DepthOnly stage. */
  DepthOnly = "DepthOnly",
  /** Depth and normal-roughness prepass stage. */
  DepthNormals = "DepthNormals",
  /** Shadow caster stage. */
  ShadowCaster = "ShadowCaster",
  /** Forward shading stage. */
  Forward = "Forward"
}
