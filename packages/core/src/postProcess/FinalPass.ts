import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { AntiAliasing } from "../enums/AntiAliasing";
import { Material } from "../material";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderPassLoadAction } from "../renderingHardwareInterface";
import { Shader } from "../shader";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 * Processing sRGB Conversion and FXAA.
 */
export class FinalPass extends PipelinePass {
  private _inputRenderTarget: RenderTarget | null;
  private _srgbRenderTarget: RenderTarget | null;
  private _antiAliasingMaterial: Material;
  private _sRGBmaterial: Material;
  private _destroyed = false;

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

  onConfig(camera: Camera, inputRenderTarget: RenderTarget): void {
    this._inputRenderTarget = inputRenderTarget;

    if (camera.antiAliasing === AntiAliasing.FXAA) {
      const { pixelViewport } = camera;
      this._srgbRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        this.engine,
        this._srgbRenderTarget,
        pixelViewport.width,
        pixelViewport.height,
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
    const { engine, _passDescriptor: passDescriptor } = this;
    const { camera } = context;
    const { viewport, renderTarget } = camera;
    const enableFXAA = camera.antiAliasing === AntiAliasing.FXAA;
    const isFullViewport = viewport.x === 0 && viewport.y === 0 && viewport.z === 1 && viewport.w === 1;
    const finalLoadAction =
      renderTarget && renderTarget.colorTextureCount === 1 && isFullViewport
        ? RenderPassLoadAction.DontCare
        : RenderPassLoadAction.Load;

    // Should convert to sRGB when FXAA is enabled or camera's render target is not set
    const sourceTexture = <Texture2D>this._inputRenderTarget!.getColorTexture();
    if (enableFXAA) {
      const srgbTarget = this._srgbRenderTarget!;
      passDescriptor.reset(srgbTarget);
      passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, sourceTexture, 0, this._sRGBmaterial, 0);
      context.endRenderPass();

      const sRGBTexture = <Texture2D>srgbTarget.getColorTexture();
      passDescriptor.reset(renderTarget, viewport);
      passDescriptor.colorLoadAction = finalLoadAction;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, sRGBTexture, 0, this._antiAliasingMaterial, 0);
      context.endRenderPass();
    } else {
      passDescriptor.reset(renderTarget, viewport);
      passDescriptor.colorLoadAction = finalLoadAction;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, sourceTexture, 0, this._sRGBmaterial, 0);
      context.endRenderPass();
    }
  }

  release(): void {
    const srgbRenderTarget = this._srgbRenderTarget;
    if (srgbRenderTarget) {
      this.engine._renderTargetPool.freeRenderTarget(srgbRenderTarget);
      this._srgbRenderTarget = null;
    }
    this._inputRenderTarget = null;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.release();
    this._sRGBmaterial._addReferCount(-1);
    this._sRGBmaterial.destroy();
    this._antiAliasingMaterial._addReferCount(-1);
    this._antiAliasingMaterial.destroy();
  }
}
