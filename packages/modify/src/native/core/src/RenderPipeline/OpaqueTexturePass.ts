import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Downsampling } from "../enums/Downsampling";
import { RenderBufferLoadAction } from "../renderingHardwareInterface";
import { Texture, Texture2D, TextureFilterMode, TextureFormat } from "../texture";
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
  private _cameraColorTexture: Texture | null;
  private _renderTarget: RenderTarget | null;

  constructor(engine: Engine) {
    super(engine);
  }

  get renderTarget(): RenderTarget | null {
    return this._renderTarget;
  }

  onConfig(camera: Camera, cameraColorTexture: Texture, requireMipmaps: boolean = false): void {
    this._cameraColorTexture = cameraColorTexture;

    const downsampling = camera.opaqueTextureDownsampling;
    const isNoDownsampling = downsampling === Downsampling.None;
    const viewport = camera.pixelViewport;
    const sizeScale = isNoDownsampling ? 1.0 : downsampling === Downsampling.TwoX ? 0.5 : 0.25;
    const targetW = Math.max(1, Math.floor(viewport.width * sizeScale));
    const targetH = Math.max(1, Math.floor(viewport.height * sizeScale));
    const rhi = this.engine._hardwareRenderer;
    const isHDR = camera._isInternalFormatHDR();
    const isSRGB = !isHDR;
    const colorFormat =
      isHDR && rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)
        ? TextureFormat.R11G11B10_UFloat
        : camera._getInternalColorTextureFormat();
    const canHardwareMip =
      requireMipmaps && Math.max(targetW, targetH) > 1 && rhi.supportsGenerateMipmaps(colorFormat, isSRGB);

    const opaqueRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._renderTarget,
      targetW,
      targetH,
      colorFormat,
      null,
      false,
      canHardwareMip,
      isSRGB,
      1,
      TextureWrapMode.Clamp,
      canHardwareMip
        ? TextureFilterMode.Trilinear
        : isNoDownsampling
          ? TextureFilterMode.Point
          : TextureFilterMode.Bilinear
    );

    if (canHardwareMip) {
      opaqueRenderTarget.autoGenerateMipmaps = false;
    } else {
      const tex = opaqueRenderTarget.getColorTexture(0) as Texture2D | null;
      if (tex && tex._supportsMipLevelRange()) {
        tex._setMipLevelRange(0, 1000);
      }
    }

    this._renderTarget = opaqueRenderTarget;
  }

  override onRender(context: RenderContext): void {
    const target = this._renderTarget!;
    Blitter._blitTexture(
      this.engine,
      <Texture2D>this._cameraColorTexture,
      target,
      0,
      undefined,
      null,
      0,
      undefined,
      RenderBufferLoadAction.DontCare
    );
    context.camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, target.getColorTexture(0));
  }

  release(): void {
    if (this._renderTarget) {
      const tex = this._renderTarget.getColorTexture(0) as Texture2D | null;
      if (tex && tex._supportsMipLevelRange()) {
        tex._setMipLevelRange(0, 1000);
      }
      this.engine._renderTargetPool.freeRenderTarget(this._renderTarget);
      this._renderTarget = null;
    }
    this._cameraColorTexture = null;
  }
}
