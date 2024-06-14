import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Downsampling } from "../enums/Downsampling";
import { Texture, Texture2D, TextureFilterMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { PipelinePass } from "./PipelinePass";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";

/**
 * @internal
 * Opaque texture pass.
 */
export class OpaqueTexturePass extends PipelinePass {
  private _cameraColorTexture: Texture;
  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  onConfig(camera: Camera, cameraColorTexture: Texture): void {
    this._cameraColorTexture = cameraColorTexture;

    const downsampling = camera.opaqueTextureDownsampling;
    const isNoDownsampling = downsampling === Downsampling.None;

    const viewport = camera.pixelViewport;
    const sizeScale = isNoDownsampling ? 1.0 : downsampling === Downsampling.TwoX ? 0.5 : 0.25;
    const opaqueRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._renderTarget,
      viewport.width * sizeScale,
      viewport.height * sizeScale,
      camera._getInternalColorTextureFormat(),
      null,
      false,
      false,
      1
    );

    const colorTexture = opaqueRenderTarget.getColorTexture(0);
    colorTexture.wrapModeU = colorTexture.wrapModeV = TextureWrapMode.Clamp;
    colorTexture.filterMode = isNoDownsampling ? TextureFilterMode.Point : TextureFilterMode.Bilinear;
    this._renderTarget = opaqueRenderTarget;
  }

  onRender(context: RenderContext): void {
    PipelineUtils.blitTexture(this.engine, <Texture2D>this._cameraColorTexture, this._renderTarget);
    context.camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, this._renderTarget.getColorTexture(0));
  }
}
