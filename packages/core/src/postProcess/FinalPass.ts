import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader } from "../shader";
import { ShaderLib } from "../shaderlib";
import { Blitter } from "../RenderPipeline/Blitter";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import sRGBFs from "./shaders/FinalSRGB.glsl";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { PostProcessPass, PostProcessPassEvent } from "./PostProcessPass";
import FXAA3_11 from "./shaders/FXAA/FXAA3_11.glsl";
import FinalPost from "./shaders/FinalPost.glsl";
import { AntiAliasing } from "../enums/AntiAliasing";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";

export class FinalPass extends PostProcessPass {
  private _fxaaMaterial: Material;
  private _sRGBmaterial: Material;
  private _swapRenderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);

    // Final sRGB Material
    this._sRGBmaterial = new Material(engine, Shader.find("FinalSRGB"));
    const depthState = this._sRGBmaterial.renderState.depthState;
    depthState.enabled = false;
    depthState.writeEnabled = false;

    // FXAA Material
    const fxaaMaterial = new Material(engine, Shader.find("FinalPost"));
    const finalDepthState = fxaaMaterial.renderState.depthState;
    finalDepthState.enabled = false;
    finalDepthState.writeEnabled = false;
    this._fxaaMaterial = fxaaMaterial;
    this.event = PostProcessPassEvent.AfterUber + 1;
  }

  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const sRGBMaterial = this._sRGBmaterial;
    const { engine } = camera;
    if (camera?.antiAliasing === AntiAliasing.FXAA) {
      const swapRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._swapRenderTarget,
        camera.pixelViewport.width,
        camera.pixelViewport.height,
        camera._getInternalColorTextureFormat(),
        TextureFormat.Depth24Stencil8,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      this._swapRenderTarget = swapRenderTarget;

      Blitter.blitTexture(engine, srcTexture, swapRenderTarget, 0, camera.viewport, sRGBMaterial);
      Blitter.blitTexture(
        engine,
        swapRenderTarget.getColorTexture() as Texture2D,
        destTarget,
        0,
        camera.viewport,
        this._fxaaMaterial
      );
    } else {
      Blitter.blitTexture(engine, srcTexture, destTarget, 0, camera.viewport, sRGBMaterial);
    }
  }
}

Object.assign(ShaderLib, {
  FXAA3_11
});

Shader.create("FinalSRGB", blitVs, sRGBFs);
Shader.create("FinalPost", blitVs, FinalPost);
