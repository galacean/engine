import { Engine } from "../Engine";
import { CullingResults } from "../RenderPipeline/CullingResults";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderPassDescriptor } from "../renderingHardwareInterface";

/**
 * PipelinePass is a base class for all pipeline passes.
 */
export abstract class PipelinePass {
  protected _passDescriptor = new RenderPassDescriptor();

  constructor(public readonly engine: Engine) {}

  /**
   * Called before rendering a camera, override this method to configure the camera If you need to configure the camera clear flag or render target.
   * @param context - Rendering context
   * @param cullingResults - Culling results
   */
  abstract onRender(context: RenderContext, cullingResults: CullingResults): void;
}
