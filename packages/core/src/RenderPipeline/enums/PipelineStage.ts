/**
 * Pipeline stage.
 */
export const PipelineStage = {
  /** DepthOnly stage. */
  DepthOnly: "DepthOnly",
  /** Shadow caster stage. */
  ShadowCaster: "ShadowCaster",
  /** Forward shading stage. */
  Forward: "Forward"
} as const;

export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];
