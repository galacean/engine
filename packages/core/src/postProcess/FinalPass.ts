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
import BlitVS from "../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import FinalAntiAliasingFS from "./shaders/FinalAntiAliasing.fs.glsl";
import SRGBFS from "./shaders/FinalSRGB.fs.glsl";
import FXAA3_11 from "./shaders/FXAA/FXAA3_11.glsl";

/**
 * @internal
 * Processing sRGB Conversion and FXAA.
 */
export class FinalPass extends PipelinePass {
  private _inputRenderTarget: RenderTarget;
  private _srgbRenderTarget: RenderTarget;
  private _antiAliasingMaterial: Material;
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
    const antiAliasingMaterial = new Material(engine, Shader.find("FinalAntiAliasing"));
    const antiAliasingDepthState = antiAliasingMaterial.renderState.depthState;
    antiAliasingDepthState.enabled = false;
    antiAliasingDepthState.writeEnabled = false;
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
        TextureFormat.R8G8B8A8, // FXAA need color range [0, 1], so we use R8G8B8A8 and ignore camera target HDR format
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
      Blitter.blitTexture(engine, sRGBTexture, renderTarget, 0, viewport, this._antiAliasingMaterial);
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
}

Object.assign(ShaderLib, {
  FXAA3_11
});

Shader.create("FinalSRGB", BlitVS, SRGBFS);
Shader.create("FinalAntiAliasing", BlitVS, FinalAntiAliasingFS);
