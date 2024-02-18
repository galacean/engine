import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { GLCapabilityType } from "../base/Constant";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
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
    const engine = this._engine;
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._renderTarget,
      width,
      height,
      null,
      TextureFormat.Depth16,
      false,
      1
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

    cullingResults.opaqueQueue.render(camera, PipelineStage.DepthOnly);
    cullingResults.alphaTestQueue.render(camera, PipelineStage.DepthOnly);

    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this._renderTarget.depthTexture);
  }
}
