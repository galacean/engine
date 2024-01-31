import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Texture2D } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { CullingResults } from "./CullingResults";
import { PipelinePass } from "./PipelinePass";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";

/**
 * @internal
 * Color copy pass.
 */
export class CopyColorPass extends PipelinePass {
  private _cameraColorTexture: Texture2D;
  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  onConfig(camera: Camera, cameraColorTexture: Texture2D): void {
    const engine = this._engine;
    const { width, height } = camera.pixelViewport;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._renderTarget,
      width,
      height,
      TextureFormat.R8G8B8A8,
      null,
      false
    );
    const colorTexture = renderTarget.getColorTexture(0);
    colorTexture.wrapModeU = colorTexture.wrapModeV = TextureWrapMode.Clamp;
    colorTexture.filterMode = TextureFilterMode.Bilinear;

    this._renderTarget = renderTarget;
    this._cameraColorTexture = cameraColorTexture;
  }

  onRender(context: RenderContext, cullingResults: CullingResults): void {
    const engine = this._engine;
    const renderTarget = this._renderTarget;
    const camera = context.camera;
    const rhi = engine._hardwareRenderer;

    rhi.activeRenderTargetX(renderTarget);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, null);

    rhi.viewport(0, 0, renderTarget.width, renderTarget.height);
    rhi.scissor(0, 0, renderTarget.width, renderTarget.height);

    // @todo: material
    PipelineUtils.blitTexture(
      engine,
      <Texture2D>camera.renderTarget.getColorTexture(0),
      renderTarget,
      null,
      0
    );

    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this._renderTarget.depthTexture);
  }
}
