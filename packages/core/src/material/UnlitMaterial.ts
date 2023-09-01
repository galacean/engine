import { Color, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { uniform } from "../shader/ShaderUniformDecorator";
import { ShaderUniformType } from "../shader/ShaderUniformType";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Unlit Material.
 */
export class UnlitMaterial extends BaseMaterial {
  /**
   * Base color.
   */
  @uniform(ShaderUniformType.Color, {
    varName: "material_BaseColor",
    keepRef: true
  })
  baseColor: Color = new Color(1, 1, 1, 1);

  /**
   * Base texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_BaseColor",
    macroName: "MATERIAL_HAS_BASETEXTURE"
  })
  baseTexture: Texture2D;

  /**
   * Tiling and offset of main textures.
   */
  @uniform(ShaderUniformType.Vector4, {
    varName: "material_TilingOffset",
    keepRef: true
  })
  tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * Create a unlit material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("unlit"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("MATERIAL_OMIT_NORMAL");
    shaderData.enableMacro("MATERIAL_NEED_TILING_OFFSET");
  }

  /**
   * @inheritdoc
   */
  override clone(): UnlitMaterial {
    const dest = new UnlitMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
