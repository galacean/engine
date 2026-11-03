import { Engine } from "../Engine";
import { CullingResults } from "../RenderPipeline/CullingResults";
import { RenderContext } from "../RenderPipeline/RenderContext";

/** Internal insertion points offered by the basic Camera pipeline. */
export enum PipelinePassStage {
  /** Main Camera culling and batching are complete; Forward rendering has not started. */
  AfterCulling
}

/** Idempotent handle returned when an optional pipeline pass is registered. */
export interface PipelinePassRegistration {
  unregister(): void;
}

/**
 * PipelinePass is a base class for all pipeline passes.
 */
export abstract class PipelinePass {
  constructor(public readonly engine: Engine) {}

  /**
   * Called at the pass's registered or built-in pipeline stage.
   * @param context - Rendering context
   * @param cullingResults - Culling results
   */
  abstract onRender(context: RenderContext, cullingResults: CullingResults): void;
}
