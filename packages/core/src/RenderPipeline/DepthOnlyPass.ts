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
  readonly supportDepthTexture: boolean;
  renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
    this.supportDepthTexture = engine._hardwareRenderer.canIUse(GLCapabilityType.depthTexture);
  }

  onConfig(camera: Camera): void {
    const engine = this.engine;
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this.renderTarget,
      width,
      height,
      null,
      engine._hardwareRenderer.isWebGL2 ? TextureFormat.Depth24 : TextureFormat.Depth24Stencil8,
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
    cullingResults.opaqueQueue.render(context, PipelineStage.DepthOnly);
    cullingResults.alphaTestQueue.render(context, PipelineStage.DepthOnly);

    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this.renderTarget.depthTexture);
  }

  release(): void {
    const renderTarget = this.renderTarget;
    if (renderTarget) {
      renderTarget.depthTexture?.destroy(true);
      renderTarget.destroy(true);
      this.renderTarget = null;
    }
  }
}
