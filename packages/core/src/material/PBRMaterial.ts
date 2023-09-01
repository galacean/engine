import { Engine } from "../Engine";
import { ShaderProperty, ShaderUniformType, uniform } from "../shader";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Metallic-Roughness Workflow) Material.
 */
export class PBRMaterial extends PBRBaseMaterial {
  private static _iorProp = ShaderProperty.getByName("material_IOR");

  /**
   * Index Of Refraction.
   * @defaultValue `1.5`
   */
  get ior(): number {
    return this.shaderData.getFloat(PBRMaterial._iorProp);
  }

  set ior(v: number) {
    this.shaderData.setFloat(PBRMaterial._iorProp, Math.max(v, 0));
  }

  /**
   * Metallic.
   * @defaultValue `1.0`
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_Metal"
  })
  metallic = 1;

  /**
   * Roughness. default 1.0.
   * @defaultValue `1.0`
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_Roughness"
  })
  roughness = 1;

  /**
   * Roughness metallic texture.
   * @remarks G channel is roughness, B channel is metallic
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_RoughnessMetallicTexture",
    macroName: "MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE"
  })
  roughnessMetallicTexture: Texture2D;

  /**
   * Create a pbr metallic-roughness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));
    this.shaderData.setFloat(PBRMaterial._iorProp, 1.5);
  }

  /**
   * @inheritdoc
   */
  override clone(): PBRMaterial {
    const dest = new PBRMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
