import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor, CullMode, Shader, ShaderPass, SubShader } from "../shader";
import { Texture2D } from "../texture";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import FRAG_SHADER from "./trail.fs.glsl";
import VERT_SHADER from "./trail.vs.glsl";

/**
 * Trail material.
 */
export class TrailMaterial extends Material {
  private static _baseTextureMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE");
  private static _baseColorProp: ShaderProperty = ShaderProperty.getByName("material_BaseColor");
  private static _baseTextureProp: ShaderProperty = ShaderProperty.getByName("material_BaseTexture");

  private static _isShaderCreated = false;

  private static _createShader(): void {
    if (TrailMaterial._isShaderCreated) return;

    const shaderPass = new ShaderPass(VERT_SHADER, FRAG_SHADER);
    const subShader = new SubShader("default", [shaderPass]);
    Shader.create("trail", [subShader]);
    TrailMaterial._isShaderCreated = true;
  }

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(TrailMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(TrailMaterial._baseColorProp);
    if (value !== baseColor) {
      baseColor.copyFrom(value);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(TrailMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    this.shaderData.setTexture(TrailMaterial._baseTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(TrailMaterial._baseTextureMacro);
    } else {
      this.shaderData.disableMacro(TrailMaterial._baseTextureMacro);
    }
  }

  /**
   * Create a trail material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    TrailMaterial._createShader();
    super(engine, Shader.find("trail"));

    const shaderData = this.shaderData;
    shaderData.setColor(TrailMaterial._baseColorProp, new Color(1, 1, 1, 1));

    // Default blend state for additive blending
    const target = this.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.One;
    target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationAlphaBlendFactor = BlendFactor.One;

    // Disable depth write for transparent rendering
    this.renderState.depthState.writeEnabled = false;

    // Disable culling for double-sided rendering
    this.renderState.rasterState.cullMode = CullMode.Off;
  }
}
