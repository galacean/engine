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
  private static _clearcoatProp = Shader.getPropertyByName("u_clearcoat");
  private static _clearcoatTextureProp = Shader.getPropertyByName("u_clearcoatTexture");
  private static _clearcoatRoughnessProp = Shader.getPropertyByName("u_clearcoatRoughness");
  private static _clearcoatRoughnessTextureProp = Shader.getPropertyByName("u_clearcoatRoughnessTexture");
  private static _clearcoatNormalTextureProp = Shader.getPropertyByName("u_clearcoatNormalTexture");

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
   * The clearcoat layer intensity, default 0.
   */
  get clearcoat(): number {
    return this.shaderData.getFloat(PBRMaterial._clearcoatProp);
  }

  set clearcoat(value: number) {
    this.shaderData.setFloat(PBRMaterial._clearcoatProp, value);

    if (value === 0) {
      this.shaderData.disableMacro("CLEARCOAT");
    } else {
      this.shaderData.enableMacro("CLEARCOAT");
    }
  }

  /**
   * The clearcoat layer intensity texture.
   */
  get clearcoatTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._clearcoatTextureProp);
  }

  set clearcoatTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._clearcoatTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATTEXTURE");
    }
  }

  /**
   * The clearcoat layer roughness, default 0.
   */
  get clearcoatRoughness(): number {
    return this.shaderData.getFloat(PBRMaterial._clearcoatRoughnessProp);
  }

  set clearcoatRoughness(value: number) {
    this.shaderData.setFloat(PBRMaterial._clearcoatRoughnessProp, value);
  }

  /**
   * The clearcoat layer roughness texture.
   */
  get clearcoatRoughnessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._clearcoatRoughnessTextureProp);
  }

  set clearcoatRoughnessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._clearcoatRoughnessTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    }
  }

  /**
   * The clearcoat normal map texture.
   */
  get clearcoatNormalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._clearcoatNormalTextureProp);
  }

  set clearcoatNormalTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._clearcoatNormalTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATNORMALTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATNORMALTEXTURE");
    }
  }

  /**
   * Create a pbr metallic-roughness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));
    this.shaderData.setFloat(PBRMaterial._metallicProp, 1);
    this.shaderData.setFloat(PBRMaterial._roughnessProp, 1);
    this.shaderData.setFloat(PBRMaterial._clearcoatProp, 0);
    this.shaderData.setFloat(PBRMaterial._clearcoatRoughnessProp, 0);
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
