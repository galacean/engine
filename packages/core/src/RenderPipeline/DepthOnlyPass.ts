import { Engine } from "../Engine";
import { ShaderTagKey } from "../shader/ShaderTagKey";
import { PipelinePass } from "../shadow/PipelinePass";
import { RenderTarget } from "../texture/RenderTarget";
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

  override render(context: RenderContext): void {
    const rhi = this._engine._hardwareRenderer;
    rhi.activeRenderTarget(this._renderTarget, CascadedShadowCasterPass._viewport, 0);
  }
}
