import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader, ShaderMacro } from "../shader";
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

Shader.create("FinalSRGB", blitVs, sRGBFs);

export class FinalPass extends PostProcessPass {
  public static readonly _finalShaderName = "FinalPost";
  private static _fxaaEnabledMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_FXAA");
  private _finalMaterial: Material;

  private _sRGBmaterial: Material;
  private _swapRenderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);

    // Final sRGB Material
    this._sRGBmaterial = new Material(engine, Shader.find("FinalSRGB"));
    const depthState = this._sRGBmaterial.renderState.depthState;
    depthState.enabled = false;
    depthState.writeEnabled = false;

    // Final Material
    const finalMaterial = new Material(engine, Shader.find(FinalPass._finalShaderName));
    const finalDepthState = finalMaterial.renderState.depthState;
    finalDepthState.enabled = false;
    finalDepthState.writeEnabled = false;
    this._finalMaterial = finalMaterial;
    this.event = PostProcessPassEvent.AfterUber + 1;
  }

  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const material = this._finalMaterial;
    const sRGBMaterial = this._sRGBmaterial;
    const finalShaderData = material.shaderData;
    const enableFXAA = camera?.antiAliasing === AntiAliasing.FXAA;

    const swapRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      camera.engine,
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

    if (enableFXAA) {
      finalShaderData.enableMacro(FinalPass._fxaaEnabledMacro);
    } else {
      finalShaderData.disableMacro(FinalPass._fxaaEnabledMacro);
    }

    Blitter.blitTexture(camera.engine, srcTexture, swapRenderTarget, 0, camera.viewport, sRGBMaterial);
    Blitter.blitTexture(
      camera.engine,
      swapRenderTarget.getColorTexture() as Texture2D,
      destTarget,
      0,
      camera.viewport,
      material
    );
  }
}

Object.assign(ShaderLib, {
  FXAA3_11
});

Shader.create(FinalPass._finalShaderName, blitVs, FinalPost);
