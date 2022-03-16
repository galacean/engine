import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Metallic-Roughness Workflow) Material.
 */
export class PBRMaterial extends PBRBaseMaterial {
  private static _metallicProp = Shader.getPropertyByName("u_metal");
  private static _roughnessProp = Shader.getPropertyByName("u_roughness");
  private static _metallicRoughnessTextureProp = Shader.getPropertyByName("u_metallicRoughnessSampler");
  private static _iorProp = Shader.getPropertyByName("u_ior");

  /**
   * Metallic, default 1.
   */
  get metallic(): number {
    return this.shaderData.getFloat(PBRMaterial._metallicProp);
  }

  set metallic(value: number) {
    this.shaderData.setFloat(PBRMaterial._metallicProp, value);
  }

  /**
   * Roughness, default 1.
   */
  get roughness(): number {
    return this.shaderData.getFloat(PBRMaterial._roughnessProp);
  }

  set roughness(value: number) {
    this.shaderData.setFloat(PBRMaterial._roughnessProp, value);
  }

  /**
   * Roughness metallic texture.
   * @remarks G channel is roughness, B channel is metallic
   */
  get roughnessMetallicTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._metallicRoughnessTextureProp);
  }

  set roughnessMetallicTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._metallicRoughnessTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("HAS_METALROUGHNESSMAP");
    } else {
      this.shaderData.disableMacro("HAS_METALROUGHNESSMAP");
    }
  }

  /**
   * Index of refraction of the material, default 1.5 .
   * @remarks It influence the F0 of dielectric materials.
   */
  get ior(): number {
    return this.shaderData.getFloat(PBRMaterial._iorProp);
  }

  set ior(value: number) {
    this.shaderData.setFloat(PBRMaterial._iorProp, value);
  }

  /**
   * Create a pbr metallic-roughness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));

    const shaderData = this.shaderData;

    shaderData.setFloat(PBRMaterial._metallicProp, 1);
    shaderData.setFloat(PBRMaterial._roughnessProp, 1);
    shaderData.setFloat(PBRMaterial._iorProp, 1.5);
  }

  /**
   * @override
   */
  clone(): PBRMaterial {
    const dest = new PBRMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
