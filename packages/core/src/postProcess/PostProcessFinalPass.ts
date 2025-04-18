import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader, ShaderMacro } from "../shader";
import { ShaderLib } from "../shaderlib";
import { Blitter } from "../RenderPipeline/Blitter";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcessPass } from "./PostProcessPass";
import FXAA3_11 from "./shaders/FXAA/FXAA3_11.glsl";
import FinalPost from "./shaders/FinalPost.glsl";
import { AntiAliasing } from "../enums/AntiAliasing";

export class FinalPass extends PostProcessPass {
  public static readonly _finalShaderName = "FinalPost";
  private static _fxaaEnabledMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_FXAA");
  private _finalMaterial: Material;

  constructor(engine: Engine) {
    super(engine);

    // Final Material
    const finalMaterial = new Material(engine, Shader.find(FinalPass._finalShaderName));
    const finalDepthState = finalMaterial.renderState.depthState;
    finalDepthState.enabled = false;
    finalDepthState.writeEnabled = false;
    this._finalMaterial = finalMaterial;
  }

  /** @inheritdoc */
  override isValid(): boolean {
    return true;
  }

  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const material = this._finalMaterial;
    const finalShaderData = material.shaderData;
    const enableFXAA = camera?.antiAliasing === AntiAliasing.FXAA;

    if (enableFXAA) {
      finalShaderData.enableMacro(FinalPass._fxaaEnabledMacro);
    } else {
      finalShaderData.disableMacro(FinalPass._fxaaEnabledMacro);
    }

    Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, camera.viewport, material);
  }
}

Object.assign(ShaderLib, {
  FXAA3_11
});

Shader.create(FinalPass._finalShaderName, blitVs, FinalPost);
