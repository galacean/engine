import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Specular-Glossiness Workflow) Material.
 */
export class PBRSpecularMaterial extends PBRBaseMaterial {
  private _specularColor = new Color(1, 1, 1, 1);
  private _glossiness: number = 1;
  private _specularGlossinessTexture: Texture2D;

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this._specularColor;
  }

  set specularColor(value: Color) {
    if (value !== this._specularColor) {
      value.cloneTo(this._specularColor);
    }
  }

  /**
   * Glossiness.
   */
  get glossiness(): number {
    return this._glossiness;
  }

  set glossiness(value: number) {
    this._glossiness = value;
    this.shaderData.setFloat("u_glossinessFactor", value);
  }

  /**
   * Specular glossiness texture.
   * @remarks RGB is specular, A is glossiness
   */
  get specularGlossinessTexture(): Texture2D {
    return this._specularGlossinessTexture;
  }

  set specularGlossinessTexture(value: Texture2D) {
    this._specularGlossinessTexture = value;

    if (value) {
      this.shaderData.enableMacro("HAS_SPECULARGLOSSINESSMAP");
      this.shaderData.setTexture("u_specularGlossinessSampler", value);
    } else {
      this.shaderData.disableMacro("HAS_SPECULARGLOSSINESSMAP");
    }
  }

  /**
   * Create a pbr specular-glossiness workflow material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine);

    this.shaderData.setColor("u_specularColor", this._specularColor);
    this.glossiness = this._glossiness;
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
