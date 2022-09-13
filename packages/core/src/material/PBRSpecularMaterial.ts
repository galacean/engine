import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Specular-Glossiness Workflow) Material.
 */
export class PBRSpecularMaterial extends PBRBaseMaterial {
  private static _specularColorProp = Shader.getPropertyByName("u_PBRSpecularColor");
  private static _glossinessProp = Shader.getPropertyByName("u_glossiness");
  private static _specularGlossinessTextureProp = Shader.getPropertyByName("u_specularGlossinessTexture");
  private static _specularGlossinessTextureMacro: ShaderMacro = Shader.getMacroByName("SPECULARGLOSSINESSTEXTURE");

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this.shaderData.getColor(PBRSpecularMaterial._specularColorProp);
  }

  set specularColor(value: Color) {
    const specularColor = this.shaderData.getColor(PBRSpecularMaterial._specularColorProp);
    if (value !== specularColor) {
      specularColor.copyFrom(value);
    }
  }

  /**
   * Glossiness.
   */
  get glossiness(): number {
    return this.shaderData.getFloat(PBRSpecularMaterial._glossinessProp);
  }

  set glossiness(value: number) {
    this.shaderData.setFloat(PBRSpecularMaterial._glossinessProp, value);
  }

  /**
   * Specular glossiness texture.
   * @remarks RGB is specular, A is glossiness
   */
  get specularGlossinessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRSpecularMaterial._specularGlossinessTextureProp);
  }

  set specularGlossinessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRSpecularMaterial._specularGlossinessTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(PBRSpecularMaterial._specularGlossinessTextureMacro);
    } else {
      this.shaderData.disableMacro(PBRSpecularMaterial._specularGlossinessTextureMacro);
    }
  }

  /**
   * Create a pbr specular-glossiness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr-specular"));

    this.shaderData.setColor(PBRSpecularMaterial._specularColorProp, new Color(1, 1, 1, 1));
    this.shaderData.setFloat(PBRSpecularMaterial._glossinessProp, 1.0);
  }

  /**
   * @override
   */
  clone(): PBRSpecularMaterial {
    const dest = new PBRSpecularMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
