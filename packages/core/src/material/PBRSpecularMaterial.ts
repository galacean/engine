import { Color } from "@galacean/engine-math";
import { uniform, ShaderUniformType } from "..";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Specular-Glossiness Workflow) Material.
 */
export class PBRSpecularMaterial extends PBRBaseMaterial {
  /**
   * Specular color.
   */
  @uniform(ShaderUniformType.Color, {
    varName: "material_PBRSpecularColor",
    keepRef: true
  })
  specularColor: Color = new Color(1, 1, 1, 1);

  /**
   * Glossiness.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_Glossiness"
  })
  glossiness: number = 1;

  /**
   * Specular glossiness texture.
   * @remarks RGB is specular, A is glossiness
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_SpecularGlossinessTexture",
    macroName: "MATERIAL_HAS_SPECULAR_GLOSSINESS_TEXTURE"
  })
  specularGlossinessTexture: Texture2D;

  /**
   * Create a pbr specular-glossiness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr-specular"));
  }

  /**
   * @inheritdoc
   */
  override clone(): PBRSpecularMaterial {
    const dest = new PBRSpecularMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
