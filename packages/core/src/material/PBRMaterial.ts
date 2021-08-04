import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Metallic-Roughness Workflow) Material.
 */
export class PBRMaterial extends PBRBaseMaterial {
  private _metallic: number = 1;
  private _roughness: number = 1;
  private _roughnessMetallicTexture: Texture2D;

  /**
   * Metallic.
   */
  get metallic(): number {
    return this._metallic;
  }

  set metallic(value: number) {
    this._metallic = value;
    this.shaderData.setFloat("u_metal", value);
  }

  /**
   * Roughness.
   */
  get roughness(): number {
    return this._roughness;
  }

  set roughness(value: number) {
    this._roughness = value;
    this.shaderData.setFloat("u_roughness", value);
  }

  /**
   * Roughness metallic texture.
   * @remarks G channel is roughness, B channel is metallic
   */
  get roughnessMetallicTexture(): Texture2D {
    return this._roughnessMetallicTexture;
  }

  set roughnessMetallicTexture(value: Texture2D) {
    this._roughnessMetallicTexture = value;

    if (value) {
      this.shaderData.enableMacro("HAS_METALROUGHNESSMAP");
      this.shaderData.setTexture("u_metallicRoughnessSampler", value);
    } else {
      this.shaderData.disableMacro("HAS_METALROUGHNESSMAP");
    }
  }

  /**
   * Create a pbr metallic-roughness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine);
    this.shaderData.enableMacro("IS_METALLIC_WORKFLOW");

    this.metallic = this._metallic;
    this.roughness = this._roughness;
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
