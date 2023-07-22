import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { ShaderProperty } from "../shader/ShaderProperty";
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
  private static _shadowMapsProperty = ShaderProperty.getByName("camera_DepthTexture");

  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  override onConfig(camera: Camera): void {
    const engine = this._engine;
    const rhi = engine._hardwareRenderer;

    // @todo: remove hack
    let width: number, height: number;
    const cameraRenderTarget = camera.renderTarget;
    if (camera.renderTarget) {
      width = cameraRenderTarget.width;
      height = cameraRenderTarget.height;
    } else {
      width = rhi._gl.drawingBufferWidth;
      height = rhi._gl.drawingBufferHeight;
    }

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
    depthTexture.wrapModeU = renderTarget.depthTexture.wrapModeV = TextureWrapMode.Clamp;
    depthTexture.filterMode = TextureFilterMode.Point;
    this._renderTarget = renderTarget;
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    this.onConfig(context.camera);

    context.pipelineStageTagValue = PipelineStage.DepthOnly;
    const engine = this._engine;
    const camera = context.camera;
    const renderTarget = this._renderTarget;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, camera.viewport, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);

    rhi.viewport(0, 0, renderTarget.width, renderTarget.height);
    rhi.scissor(0, 0, renderTarget.width, renderTarget.height);

    cullingResults.opaqueQueue.render(context, camera, Layer.Everything);
    cullingResults.alphaTestQueue.render(context, camera, Layer.Everything);

    camera.shaderData.setTexture(DepthOnlyPass._shadowMapsProperty, this._renderTarget.depthTexture);
  }
}
