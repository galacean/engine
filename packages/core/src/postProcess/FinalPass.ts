import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { AntiAliasing } from "../enums/AntiAliasing";
import { Material } from "../material";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Shader } from "../shader";
import {
  RenderTarget,
  Texture2D,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "../texture";

/**
 * @internal
 * Processing sRGB Conversion and FXAA.
 */
export class FinalPass extends PipelinePass {
  private _inputRenderTarget: RenderTarget | null;
  private _srgbRenderTarget: RenderTarget | null;
  private _destMipLevel: number = 0;
  private _destCubeFace: TextureCubeFace | undefined = undefined;
  private _antiAliasingMaterial: Material;
  private _sRGBmaterial: Material;

  constructor(engine: Engine, sRGBShader: Shader, antiAliasingShader: Shader) {
    super(engine);

    // SRGB Material
    const sRGBmaterial = new Material(engine, sRGBShader);
    sRGBmaterial._addReferCount(1);
    this._sRGBmaterial = sRGBmaterial;

    // FXAA Material
    const antiAliasingMaterial = new Material(engine, antiAliasingShader);
    antiAliasingMaterial._addReferCount(1);
    this._antiAliasingMaterial = antiAliasingMaterial;
  }

  onConfig(
    camera: Camera,
    inputRenderTarget: RenderTarget,
    width: number = camera.pixelViewport.width,
    height: number = camera.pixelViewport.height,
    mipLevel: number = 0,
    cubeFace?: TextureCubeFace
  ): void {
    this._inputRenderTarget = inputRenderTarget;
    this._destMipLevel = mipLevel;
    this._destCubeFace = cubeFace;

    if (camera.antiAliasing === AntiAliasing.FXAA) {
      this._srgbRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        this.engine,
        this._srgbRenderTarget,
        width,
        height,
        TextureFormat.R8G8B8A8_UNorm, // FXAA need color range [0, 1], so we use R8G8B8A8_UNorm and ignore camera target HDR format
        null,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
    }
  }

  override onRender(context: RenderContext): void {
    const { engine } = this;
    const { camera } = context;
    const { viewport, renderTarget } = camera;
    const enableFXAA = camera.antiAliasing === AntiAliasing.FXAA;

    // Should convert to sRGB when FXAA is enabled or camera's render target is not set
    const sourceTexture = <Texture2D>this._inputRenderTarget!.getColorTexture();
    if (enableFXAA) {
      Blitter.blitTexture(engine, sourceTexture, this._srgbRenderTarget, 0, undefined, this._sRGBmaterial);
      const sRGBTexture = <Texture2D>this._srgbRenderTarget!.getColorTexture();
      Blitter.blitTexture(
        engine,
        sRGBTexture,
        renderTarget,
        0,
        viewport,
        this._antiAliasingMaterial,
        0,
        undefined,
        this._destMipLevel,
        this._destCubeFace
      );
    } else {
      Blitter.blitTexture(
        engine,
        sourceTexture,
        renderTarget,
        0,
        viewport,
        this._sRGBmaterial,
        0,
        undefined,
        this._destMipLevel,
        this._destCubeFace
      );
    }
  }

  release(): void {
    const srgbRenderTarget = this._srgbRenderTarget;
    if (srgbRenderTarget) {
      this.engine._renderTargetPool.freeRenderTarget(srgbRenderTarget);
      this._srgbRenderTarget = null;
    }
    this._inputRenderTarget = null;
    this._destMipLevel = 0;
    this._destCubeFace = undefined;
  }
}
