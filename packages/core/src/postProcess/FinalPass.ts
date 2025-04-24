import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { AntiAliasing } from "../enums/AntiAliasing";
import { Material } from "../material";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Shader } from "../shader";
import { ShaderLib } from "../shaderlib";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D, TextureFilterMode, TextureWrapMode } from "../texture";
import FinalPost from "./shaders/FinalPost.glsl";
import sRGBFs from "./shaders/FinalSRGB.glsl";
import FXAA3_11 from "./shaders/FXAA/FXAA3_11.glsl";

/**
 * @internal
 * Processing sRGB Conversion and FXAA.
 */
export class FinalPass extends PipelinePass {
  private _inputRenderTarget: RenderTarget;
  private _srgbRenderTarget: RenderTarget;
  private _fxaaMaterial: Material;
  private _sRGBmaterial: Material;

  constructor(engine: Engine) {
    super(engine);

    // SRGB Material
    const sRGBmaterial = new Material(engine, Shader.find("FinalSRGB"));
    const sRGBdepthState = sRGBmaterial.renderState.depthState;
    sRGBdepthState.enabled = false;
    sRGBdepthState.writeEnabled = false;
    sRGBmaterial._addReferCount(1);
    this._sRGBmaterial = sRGBmaterial;

    // FXAA Material
    const fxaaMaterial = new Material(engine, Shader.find("FinalPost"));
    const fxaaDepthState = fxaaMaterial.renderState.depthState;
    fxaaDepthState.enabled = false;
    fxaaDepthState.writeEnabled = false;
    fxaaMaterial._addReferCount(1);
    this._fxaaMaterial = fxaaMaterial;
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
        camera._getTargetColorTextureFormat(),
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
    const sourceTexture = <Texture2D>this._inputRenderTarget.getColorTexture();
    const outputRenderTarget = enableFXAA ? this._srgbRenderTarget : renderTarget;
    Blitter.blitTexture(engine, sourceTexture, outputRenderTarget, 0, viewport, this._sRGBmaterial);

    if (enableFXAA) {
      const sRGBTexture = <Texture2D>this._srgbRenderTarget.getColorTexture();
      Blitter.blitTexture(engine, sRGBTexture, renderTarget, 0, viewport, this._fxaaMaterial);
    }
  }

  release(): void {
    const srgbRenderTarget = this._srgbRenderTarget;
    if (srgbRenderTarget) {
      srgbRenderTarget.getColorTexture(0)?.destroy(true);
      srgbRenderTarget.destroy(true);
      this._srgbRenderTarget = null;
    }
    this._inputRenderTarget = null;
  }

  onDestroy() {
    this._sRGBmaterial.destroy();
    this._fxaaMaterial.destroy();
    this._srgbRenderTarget?.destroy();
    this._inputRenderTarget = null;
  }
}

Object.assign(ShaderLib, {
  FXAA3_11
});

Shader.create("FinalSRGB", blitVs, sRGBFs);
Shader.create("FinalPost", blitVs, FinalPost);
