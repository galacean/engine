import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { PipelinePass } from "../shadow/PipelinePass";
import { TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { CullingResults } from "./CullingResults";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * Depth only pass.
 */
export class DepthOnlyPass extends PipelinePass {
  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  override onConfig(camera: Camera): void {
    const engine = this._engine;
    const { z: width, w: height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._renderTarget,
      width,
      height,
      null,
      TextureFormat.Depth16,
      false
    );
    const { depthTexture } = renderTarget;
    depthTexture.wrapModeU = depthTexture.wrapModeV = TextureWrapMode.Clamp;
    depthTexture.filterMode = TextureFilterMode.Point;

    this._renderTarget = renderTarget;
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {

    const engine = this._engine;
    const renderTarget = this._renderTarget;
    const camera = context.camera;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, camera.viewport, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);

    rhi.viewport(0, 0, renderTarget.width, renderTarget.height);
    rhi.scissor(0, 0, renderTarget.width, renderTarget.height);

    cullingResults.opaqueQueue.render(context, camera, Layer.Everything, PipelineStage.DepthOnly);
    cullingResults.alphaTestQueue.render(context, camera, Layer.Everything, PipelineStage.DepthOnly);

    camera.shaderData.setTexture(Camera._cameraTextureProperty, this._renderTarget.depthTexture);
  }
}
