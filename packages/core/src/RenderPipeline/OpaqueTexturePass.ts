import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Downsampling } from "../enums/Downsampling";
import { Texture, Texture2D, TextureFilterMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { Blitter } from "./Blitter";
import { PipelinePass } from "./PipelinePass";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";

/**
 * @internal
 * Opaque texture pass.
 */
export class OpaqueTexturePass extends PipelinePass {
  private _cameraColorTexture: Texture | null = null;
  private _renderTarget: RenderTarget | null = null;
  private _sourceMipLevel: number = 0;

  constructor(engine: Engine) {
    super(engine);
  }

  onConfig(
    camera: Camera,
    cameraColorTexture: Texture,
    width: number = camera.pixelViewport.width,
    height: number = camera.pixelViewport.height,
    sourceMipLevel: number = 0
  ): void {
    this._cameraColorTexture = cameraColorTexture;
    this._sourceMipLevel = sourceMipLevel;

    const downsampling = camera.opaqueTextureDownsampling;
    const isNoDownsampling = downsampling === Downsampling.None;

    const sizeScale = isNoDownsampling ? 1.0 : downsampling === Downsampling.TwoX ? 0.5 : 0.25;
    const opaqueRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._renderTarget,
      Math.max(1, Math.floor(width * sizeScale)),
      Math.max(1, Math.floor(height * sizeScale)),
      camera._getInternalColorTextureFormat(),
      null,
      false,
      false,
      !camera._isInternalFormatHDR(),
      1,
      TextureWrapMode.Clamp,
      isNoDownsampling ? TextureFilterMode.Point : TextureFilterMode.Bilinear
    );

    this._renderTarget = opaqueRenderTarget;
  }

  override onRender(context: RenderContext): void {
    Blitter.blitTexture(this.engine, <Texture2D>this._cameraColorTexture, this._renderTarget, this._sourceMipLevel);
    context.camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, this._renderTarget!.getColorTexture(0));
  }

  release(): void {
    const renderTarget = this._renderTarget;
    if (renderTarget) {
      this.engine._renderTargetPool.freeRenderTarget(renderTarget);
      this._renderTarget = null;
    }
    this._cameraColorTexture = null;
    this._sourceMipLevel = 0;
  }
}
