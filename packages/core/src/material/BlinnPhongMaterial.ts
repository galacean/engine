import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { BlendOperation } from "../shader/enums/BlendOperation";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { AlphaMode } from "./enums/AlphaMode";
import { RenderQueueType } from "./enums/RenderQueueType";
import { Material } from "./Material";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends Material {
  /**
   * Ambient color.
   */
  get ambientColor(): Color {
    return this._ambientColor;
  }

  set ambientColor(value: Color) {
    this._ambientColor = value;
    this.shaderData.setColor("u_ambientColor", value);
  }

  /**
   * Ambient texture.
   */
  get ambientTexture(): Texture2D {
    return this._ambientTexture;
  }

  set ambientTexture(value: Texture2D) {
    this._ambientTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_AMBIENT_TEXTURE");
      this.shaderData.setTexture("u_ambientTexture", value);
    } else {
      this.shaderData.disableMacro("O3_AMBIENT_TEXTURE");
    }
  }

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
      case AlphaMode.CutOff:
        {
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.One;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.Zero;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = true;
          this.renderQueueType = RenderQueueType.AlphaTest;
        }
        break;
    }
  }

  private _ambientColor: Color = new Color(0, 0, 0, 1);
  private _emissiveColor: Color = new Color(0, 0, 0, 1);
  private _diffuseColor: Color = new Color(1, 1, 1, 1);
  private _specularColor: Color = new Color(1, 1, 1, 1);
  private _ambientTexture: Texture2D;
  private _emissiveTexture: Texture2D;
  private _diffuseTexture: Texture2D;
  private _specularTexture: Texture2D;
  private _shininess: number = 16;
  private _alphaMode: AlphaMode = AlphaMode.Opaque;

  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));
    this.shaderData.enableMacro("O3_NEED_WORLDPOS");

    this.ambientColor = this._ambientColor;
    this.emissiveColor = this._emissiveColor;
    this.diffuseColor = this._diffuseColor;
    this.specularColor = this._specularColor;
    this.shininess = this._shininess;
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
