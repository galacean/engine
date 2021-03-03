import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { BlendOperation } from "../shader/enums/BlendOperation";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { AlphaMode } from "./enums/AlphaMode";
import { RenderQueueType } from "./enums/RenderQueueType";
import { Material } from "./Material";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends Material {
  private _emissiveColor: Color = new Color(0, 0, 0, 1);
  private _diffuseColor: Color = new Color(1, 1, 1, 1);
  private _specularColor: Color = new Color(1, 1, 1, 1);
  private _emissiveTexture: Texture2D;
  private _diffuseTexture: Texture2D;
  private _specularTexture: Texture2D;
  private _normalTexture: Texture2D;
  private _normalIntensity: number = 1;
  private _shininess: number = 16;
  private _alphaMode: AlphaMode = AlphaMode.Opaque;
  private _doubleSided: boolean = false;

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this._emissiveColor;
  }

  set emissiveColor(value: Color) {
    this._emissiveColor = value;
    this.shaderData.setColor("u_emissiveColor", value);
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return this._emissiveTexture;
  }

  set emissiveTexture(value: Texture2D) {
    this._emissiveTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_EMISSIVE_TEXTURE");
      this.shaderData.setTexture("u_emissiveTexture", value);
    } else {
      this.shaderData.disableMacro("O3_EMISSIVE_TEXTURE");
    }
  }

  /**
   * Diffuse color.
   */
  get diffuseColor(): Color {
    return this._diffuseColor;
  }

  set diffuseColor(value: Color) {
    this._diffuseColor = value;
    this.shaderData.setColor("u_diffuseColor", value);
  }

  /**
   * Diffuse texture.
   */
  get diffuseTexture(): Texture2D {
    return this._diffuseTexture;
  }

  set diffuseTexture(value: Texture2D) {
    this._diffuseTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_DIFFUSE_TEXTURE");
      this.shaderData.setTexture("u_diffuseTexture", value);
    } else {
      this.shaderData.disableMacro("O3_DIFFUSE_TEXTURE");
    }
  }

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this._specularColor;
  }

  set specularColor(value: Color) {
    this._specularColor = value;
    this.shaderData.setColor("u_specularColor", value);
  }

  /**
   * Specular texture.
   */
  get specularTexture(): Texture2D {
    return this._specularTexture;
  }

  set specularTexture(value: Texture2D) {
    this._specularTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_SPECULAR_TEXTURE");
      this.shaderData.setTexture("u_specularTexture", value);
    } else {
      this.shaderData.disableMacro("O3_SPECULAR_TEXTURE");
    }
  }

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return this._normalTexture;
  }

  set normalTexture(value: Texture2D) {
    this._normalTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_NORMAL_TEXTURE");
      this.shaderData.setTexture("u_normalTexture", value);
    } else {
      this.shaderData.disableMacro("O3_NORMAL_TEXTURE");
    }
  }

  /**
   * Normal texture intensity.
   */
  get normalIntensity(): number {
    return this._normalIntensity;
  }

  set normalIntensity(value: number) {
    this._normalIntensity = value;
    this.shaderData.setFloat("u_normalIntensity", value);
  }

  /**
   * Set the specular reflection coefficient, the larger the value, the more convergent the specular reflection effect.
   */
  get shininess(): number {
    return this._shininess;
  }

  set shininess(value: number) {
    this._shininess = value;
    this.shaderData.setFloat("u_shininess", value);
  }

  /**
   * Transparent mode.
   */
  get alphaMode(): AlphaMode {
    return this._alphaMode;
  }

  set alphaMode(v: AlphaMode) {
    const target = this.renderState.blendState.targetBlendState;
    const depthState = this.renderState.depthState;

    switch (v) {
      case AlphaMode.Opaque:
      case AlphaMode.CutOff:
        {
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.One;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.Zero;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = true;
          this.renderQueueType = RenderQueueType.Opaque;
        }
        break;
      case AlphaMode.Blend:
        {
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = false;
          this.renderQueueType = RenderQueueType.Transparent;
        }
        break;
    }
  }

  /**
   * Whether to render both sides.
   * @remarks Only the front side is rendered by default
   */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(v: boolean) {
    if (v) {
      this.renderState.rasterState.cullMode = CullMode.Off;
    } else {
      this.renderState.rasterState.cullMode = CullMode.Back;
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));
    this.shaderData.enableMacro("O3_NEED_WORLDPOS");

    this.emissiveColor = this._emissiveColor;
    this.diffuseColor = this._diffuseColor;
    this.specularColor = this._specularColor;
    this.shininess = this._shininess;
    this.normalIntensity = this._normalIntensity;
  }

  /**
   * @override
   */
  clone(): BlinnPhongMaterial {
    var dest: BlinnPhongMaterial = new BlinnPhongMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
