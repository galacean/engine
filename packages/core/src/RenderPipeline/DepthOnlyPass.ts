import { Engine } from "../Engine";
import { PipelinePass } from "../shadow/PipelinePass";
import { RenderTarget } from "../texture/RenderTarget";
import { CullingResults } from "./CullingResults";
import { RenderContext } from "./RenderContext";

/**
 * Depth only pass.
 */
export class DepthOnlyPass extends PipelinePass {
  private static _pipelineStageValue: string = "DepthOnly";

  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  override onConfig(): void {
    
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    const camera = context.camera;
    context.drawRenderers(camera, cullingResults);
  }
}
