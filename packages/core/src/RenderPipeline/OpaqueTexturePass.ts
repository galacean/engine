import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Texture, Texture2D } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
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
export class OpaqueTexturePass extends PipelinePass {
  private _cameraColorTexture: Texture;
  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  onConfig(camera: Camera, cameraColorTexture: Texture): void {
    this._cameraColorTexture = cameraColorTexture;

    const viewport = camera.pixelViewport;
    const opaqueRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this._engine,
      this._renderTarget,
      viewport.width,
      viewport.height,
      TextureFormat.R8G8B8A8,
      null,
      false
    );

    const colorTexture = opaqueRenderTarget.getColorTexture(0);
    colorTexture.wrapModeU = colorTexture.wrapModeV = TextureWrapMode.Clamp;
    this._renderTarget = opaqueRenderTarget;
  }

  onRender(context: RenderContext, _: CullingResults): void {
    PipelineUtils.blitTexture(this._engine, <Texture2D>this._cameraColorTexture, this._renderTarget, null, 0);
    context.camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, this._renderTarget.getColorTexture(0));
  }
}
