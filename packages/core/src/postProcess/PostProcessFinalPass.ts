import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader, ShaderMacro } from "../shader";
import { ShaderLib } from "../shaderlib";
import { Blitter } from "../RenderPipeline/Blitter";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcessPass, PostProcessPassEvent } from "./PostProcessPass";
import PostCommon from "./shaders/PostCommon.glsl";
import FXAA3_11 from "./shaders/FXAA/FXAA3_11.glsl";
import FinalPost from "./shaders/FinalPost.glsl";
import { AntiAliasing } from "../enums/AntiAliasing";

export class PostProcessFinalPass extends PostProcessPass {
  static readonly FINAL_SHADER_NAME = "FinalPost";
  static _fxaaEnabledMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_FXAA");
  private _finalMaterial: Material;

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.Final;

    // Final Material
    const finalMaterial = new Material(engine, Shader.find(PostProcessFinalPass.FINAL_SHADER_NAME));
    this._finalMaterial = finalMaterial;
  }

  override isValid(): boolean {
    return true;
  }

  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const material = this._finalMaterial;
    const enableFXAA = camera.antiAliasing == AntiAliasing.FastApproximateAntiAliasing;

    if (enableFXAA) {
      material.shaderData.enableMacro(PostProcessFinalPass._fxaaEnabledMacro);
    } else {
      material.shaderData.disableMacro(PostProcessFinalPass._fxaaEnabledMacro);
    }

    Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, camera.viewport, material, undefined);
  }
}

Object.assign(ShaderLib, {
  PostCommon,
  FXAA3_11
});

Shader.create(PostProcessFinalPass.FINAL_SHADER_NAME, blitVs, FinalPost);
