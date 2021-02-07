import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Metallic-Roughness Workflow) Material.
 */
export class PBRMaterial extends PBRBaseMaterial {
  /**
   * Metallic factor.
   */
  get metallicFactor(): number {
    return this._metallicFactor;
  }

  set metallicFactor(v: number) {
    this._metallicFactor = v;
    this.shaderData.setFloat("u_metal", v);
  }

  /**
   * Rough factor.
   */
  get roughnessFactor(): number {
    return this._roughnessFactor;
  }

  set roughnessFactor(v: number) {
    this._roughnessFactor = v;
    this.shaderData.setFloat("u_roughness", v);
  }

  /**
   * Metallic texture.
   */
  get metallicTexture(): Texture2D {
    return this._metallicTexture;
  }

  set metallicTexture(v: Texture2D) {
    this._metallicTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_METALMAP");
      this.shaderData.setTexture("u_metallicSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_METALMAP");
    }
  }

  /**
   * Rough texture.
   */
  get roughnessTexture(): Texture2D {
    return this._roughnessTexture;
  }

  set roughnessTexture(v: Texture2D) {
    this._roughnessTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_ROUGHNESSMAP");
      this.shaderData.setTexture("u_roughnessSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_ROUGHNESSMAP");
    }
  }

  /**
   * Metallic rough texture.
   */
  get metallicRoughnessTexture(): Texture2D {
    return this._metallicRoughnessTexture;
  }

  set metallicRoughnessTexture(v: Texture2D) {
    this._metallicRoughnessTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_METALROUGHNESSMAP");
      this.shaderData.setTexture("u_metallicRoughnessSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_METALROUGHNESSMAP");
    }
  }

  private _metallicFactor: number = 1;
  private _roughnessFactor: number = 1;
  private _metallicTexture: Texture2D;
  private _roughnessTexture: Texture2D;
  private _metallicRoughnessTexture: Texture2D;

  /**
   * Create a pbr metallic-roughness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine);
    this.shaderData.enableMacro("IS_METALLIC_WORKFLOW");

    this.metallicFactor = this._metallicFactor;
    this.roughnessFactor = this._roughnessFactor;
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
