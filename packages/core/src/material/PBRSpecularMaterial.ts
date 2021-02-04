import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Specular-Glossiness Workflow) Material.
 */
export class PBRSpecularMaterial extends PBRBaseMaterial {
  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this._specularColor;
  }

  set specularColor(v: Color) {
    this._specularColor = v;
    this.shaderData.setColor("u_specularFactor", v);
  }

  /**
   * Glossiness factor.
   */
  get glossinessFactor(): number {
    return this._glossinessFactor;
  }

  set glossinessFactor(v: number) {
    this._glossinessFactor = v;
    this.shaderData.setFloat("u_glossinessFactor", v);
  }

  /**
   * Specular and glossiness texture.
   */
  get specularGlossinessTexture(): Texture2D {
    return this._specularGlossinessTexture;
  }

  set specularGlossinessTexture(v: Texture2D) {
    this._specularGlossinessTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_SPECULARGLOSSINESSMAP");
      this.shaderData.setTexture("u_specularGlossinessSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_SPECULARGLOSSINESSMAP");
    }
  }

  private _specularColor = new Color(1, 1, 1, 1);
  private _glossinessFactor: number = 1;
  private _specularGlossinessTexture: Texture2D;

  constructor(engine: Engine) {
    super(engine);

    this.specularColor = this._specularColor;
    this.glossinessFactor = this._glossinessFactor;
  }

  clone(): PBRSpecularMaterial {
    const dest = new PBRSpecularMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
