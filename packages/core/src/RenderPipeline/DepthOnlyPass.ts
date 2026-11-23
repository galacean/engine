import { Camera } from "../Camera";
import { RenderBufferLoadAction } from "../renderingHardwareInterface";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
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
  renderTarget: RenderTarget | null;

  onConfig(camera: Camera): void {
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this.renderTarget,
      width,
      height,
      null,
      TextureFormat.Depth24,
      true,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point
    );

    this.renderTarget = renderTarget;
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    const engine = this.engine;
    const renderTarget = this.renderTarget;
    const camera = context.camera;
    const rhi = engine._hardwareRenderer;
    context.setRenderTarget(
      renderTarget,
      PipelineUtils.defaultViewport,
      0,
      undefined,
      undefined,
      undefined,
      RenderBufferLoadAction.DontCare,
      undefined,
      "Camera Depth"
    );
    rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);

    engine._renderCount++;
    cullingResults.opaqueQueue.render(context, PipelineStage.DepthOnly);
    cullingResults.alphaTestQueue.render(context, PipelineStage.DepthOnly);

    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this.renderTarget!.depthTexture);
  }

  release(): void {
    const renderTarget = this.renderTarget;
    if (renderTarget) {
      this.engine._renderTargetPool.freeRenderTarget(renderTarget);
      this.renderTarget = null;
    }
  }
}
