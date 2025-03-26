import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { GLCapabilityType } from "../base/Constant";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { CullingResults } from "./CullingResults";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * @internal
 * Depth only pass.
 */
export class DepthOnlyPass extends PipelinePass {
  readonly _supportDepthTexture: boolean;

  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
    this._supportDepthTexture = engine._hardwareRenderer.canIUse(GLCapabilityType.depthTexture);
  }

  onConfig(camera: Camera): void {
    const engine = this.engine;
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._renderTarget,
      width,
      height,
      null,
      TextureFormat.Depth16,
      true,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point
    );

    this._renderTarget = renderTarget;
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    const engine = this.engine;
    const renderTarget = this._renderTarget;
    const camera = context.camera;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, PipelineUtils.defaultViewport, context.flipProjection, 0);
    context.setRenderTarget(renderTarget);
    rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);

    engine._renderCount++;
    cullingResults.opaqueQueue.render(context, PipelineStage.DepthOnly);
    cullingResults.alphaTestQueue.render(context, PipelineStage.DepthOnly);

    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this._renderTarget.depthTexture);
  }
}
