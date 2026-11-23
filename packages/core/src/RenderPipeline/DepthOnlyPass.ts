import { Camera } from "../Camera";
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

  onConfig(camera: Camera, needsUIStencil: boolean): void {
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this.renderTarget,
      width,
      height,
      null,
      needsUIStencil ? TextureFormat.Depth24Stencil8 : TextureFormat.Depth24,
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
    context.setRenderTarget(renderTarget, PipelineUtils.defaultViewport, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);

    engine._renderCount++;
    try {
      cullingResults.opaqueQueue.render(context, PipelineStage.DepthOnly);
      cullingResults.alphaTestQueue.render(context, PipelineStage.DepthOnly);
    } finally {
      // The following Forward pass uses a different stencil attachment.
      if (cullingResults.depthNeedsUIStencil) {
        camera.scene!._maskManager.clearUIMasks(context);
        // Mask writer programs are shared with Forward, whose projection can have a different Y flip.
        engine._renderCount++;
      }
    }

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
