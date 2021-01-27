import { Color, Matrix } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { BlendOperation } from "../shader/enums/BlendOperation";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { TextureCubeMap } from "../texture";
import { Texture2D } from "../texture/Texture2D";
import { AlphaMode } from "./enums/AlphaMode";
import { RenderQueueType } from "./enums/RenderQueueType";
import { Material } from "./Material";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export class PBRMaterial extends Material {
  /**
   * Base color.
   */
  get baseColor(): Color {
    return this._baseColor;
  }

  set baseColor(v: Color) {
    this._baseColor = v;
    this.shaderData.setColor("u_baseColorFactor", v);
  }

  /**
   * Base color texture.
   */
  get baseColorTexture(): Texture2D {
    return this._baseColorTexture;
  }

  set baseColorTexture(v: Texture2D) {
    this._baseColorTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_BASECOLORMAP");
      this.shaderData.setTexture("u_baseColorSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_BASECOLORMAP");
    }
  }

  /**
   * Transparent coefficient.
   */
  get opacity(): number {
    return this.baseColor.a;
  }

  set opacity(val: number) {
    this.baseColor.a = val;
  }

  /**
   * Transparent texture.
   * */
  get opacityTexture(): Texture2D {
    return this._opacityTexture;
  }

  set opacityTexture(v: Texture2D) {
    this._opacityTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_OPACITYMAP");
      this.shaderData.setTexture("u_opacitySampler", v);
    } else {
      this.shaderData.disableMacro("HAS_OPACITYMAP");
    }
  }

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

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return this._normalTexture;
  }

  set normalTexture(v: Texture2D) {
    this._normalTexture = v;

    if (v) {
      this.shaderData.enableMacro("O3_HAS_NORMALMAP");
      this.shaderData.setTexture("u_normalSampler", v);
    } else {
      this.shaderData.disableMacro("O3_HAS_NORMALMAP");
    }
  }

  /**
   * Normal scale factor.
   */
  get normalScale(): number {
    return this._normalScale;
  }

  set normalScale(v: number) {
    this._normalScale = v;
    this.shaderData.setFloat("u_normalScale", v);
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return this._emissiveTexture;
  }

  set emissiveTexture(v: Texture2D) {
    this._emissiveTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_EMISSIVEMAP");
      this.shaderData.setTexture("u_emissiveSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_EMISSIVEMAP");
    }
  }

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this._emissiveColor;
  }

  set emissiveColor(v: Color) {
    this._emissiveColor = v;
    this.shaderData.setColor("u_emissiveFactor", v);
  }

  /**
   * Occlusive texture.
   */
  get occlusionTexture(): Texture2D {
    return this._occlusionTexture;
  }

  set occlusionTexture(v: Texture2D) {
    this._occlusionTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_OCCLUSIONMAP");
      this.shaderData.setTexture("u_occlusionSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_OCCLUSIONMAP");
    }
  }

  /**
   * Occlusive intensity.
   */
  get occlusionStrength(): number {
    return this._occlusionStrength;
  }

  set occlusionStrength(v: number) {
    this._occlusionStrength = v;
    this.shaderData.setFloat("u_occlusionStrength", v);
  }

  /**
   * Alpha cutoff value.
   * @remarks fragments with alpha channel lower than cutoff value will be discarded.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(v: number) {
    this._alphaCutoff = v;
    this.shaderData.setFloat("u_alphaCutoff", v);
  }

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

  /**
   * Reflection texture.
   * @remarks if this texture is not set, the global environmentMapLight's specularTexture will be used.
   */
  get reflectionTexture(): TextureCubeMap {
    return this._reflectionTexture;
  }

  set reflectionTexture(v: TextureCubeMap) {
    this._reflectionTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_REFLECTIONMAP");
      this.shaderData.setTexture("u_reflectionSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_REFLECTIONMAP");
    }
  }

  /**
   * Reflection intensity.
   */
  get envMapIntensity(): number {
    return this._envMapIntensity;
  }

  set envMapIntensity(v: number) {
    this._envMapIntensity = v;
    this.shaderData.setFloat("u_envMapIntensity", v);
  }

  /**
   * The ratio of IOR(index of refraction) from air to medium.eg. 1 / 1.33 from air to water.
   */
  get refractionRatio(): number {
    return this._refractionRatio;
  }

  set refractionRatio(v: number) {
    this._refractionRatio = v;
    this.shaderData.setFloat("u_refractionRatio", v);
  }

  /**
   * The depth value of the local refraction texture, used to simulate the refraction distance.
   */
  get refractionDepth(): number {
    return this._refractionDepth;
  }

  set refractionDepth(v: number) {
    this._refractionDepth = v;
    this.shaderData.setFloat("u_refractionDepth", v);
  }

  /**
   * Local refraction texture.
   */
  get refractionTexture(): Texture2D {
    return this._refractionTexture;
  }

  set refractionTexture(v: Texture2D) {
    this._refractionTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_REFRACTIONMAP");
      this.shaderData.setTexture("u_refractionSampler", v);
      this.shaderData.setMatrix("u_PTMMatrix", this._PTMMatrix);
    } else {
      this.shaderData.disableMacro("HAS_REFRACTIONMAP");
    }
  }

  /**
   * Perturbation texture.
   */
  get perturbationTexture(): Texture2D {
    return this._perturbationTexture;
  }

  set perturbationTexture(v: Texture2D) {
    this._perturbationTexture = v;

    if (v) {
      this.shaderData.enableMacro("HAS_PERTURBATIONMAP");
      this.shaderData.setTexture("u_perturbationSampler", v);
    } else {
      this.shaderData.disableMacro("HAS_PERTURBATIONMAP");
    }
  }

  /**
   * Offset of the perturbation texture coordinate on S.
   */
  get perturbationUOffset(): number {
    return this._perturbationUOffset;
  }

  set perturbationUOffset(v: number) {
    this._perturbationUOffset = v;
    this.shaderData.setFloat("u_perturbationUOffset", v);
  }

  /**
   * Offset of the perturbation texture coordinate on T.
   */
  get perturbationVOffset(): number {
    return this._perturbationVOffset;
  }

  set perturbationVOffset(v: number) {
    this._perturbationVOffset = v;
    this.shaderData.setFloat("u_perturbationVOffset", v);
  }

  /**
   * Whether the frag color is affected by light.
   */
  get unLight(): boolean {
    return this._unLight;
  }

  set unLight(v: boolean) {
    this._unLight = v;

    if (v) {
      this.shaderData.enableMacro("UNLIT");
    } else {
      this.shaderData.disableMacro("UNLIT");
    }
  }

  /**
   * Whether to use SRGB color space.
   */
  get srgb(): boolean {
    return this._srgb;
  }

  set srgb(v: boolean) {
    this._srgb = v;

    if (v) {
      this.shaderData.enableMacro("MANUAL_SRGB");
    } else {
      this.shaderData.disableMacro("MANUAL_SRGB");
    }
  }

  /**
   * Whether sRGB linear correction uses approximate fast algorithm.
   * */
  get srgbFast(): boolean {
    return this._srgbFast;
  }

  set srgbFast(v: boolean) {
    this._srgbFast = v;

    if (v) {
      this.shaderData.enableMacro("SRGB_FAST_APPROXIMATION");
    } else {
      this.shaderData.disableMacro("SRGB_FAST_APPROXIMATION");
    }
  }

  /**
   * Whether to use Gamma correction.
   */
  get gamma(): boolean {
    return this._gamma;
  }

  set gamma(v: boolean) {
    this._gamma = v;

    if (v) {
      this.shaderData.enableMacro("GAMMA");
    } else {
      this.shaderData.disableMacro("GAMMA");
    }
  }

  /**
   * Whether to take the brightness value of the opacityTexture as the transparency.
   */
  get getOpacityFromRGB(): boolean {
    return this._getOpacityFromRGB;
  }

  set getOpacityFromRGB(v: boolean) {
    this._getOpacityFromRGB = v;

    if (v) {
      this.shaderData.enableMacro("GETOPACITYFROMRGB");
    } else {
      this.shaderData.disableMacro("GETOPACITYFROMRGB");
    }
  }

  /**
   * Whether to use metallic-roughness workflow.
   * @remarks PBR renderring will use specular-glossiness workflow if this value is false.
   */
  get isMetallicWorkflow(): boolean {
    return this._isMetallicWorkflow;
  }

  set isMetallicWorkflow(v: boolean) {
    this._isMetallicWorkflow = v;

    if (v) {
      this.shaderData.enableMacro("IS_METALLIC_WORKFLOW");
    } else {
      this.shaderData.disableMacro("IS_METALLIC_WORKFLOW");
    }
  }

  /**
   * Whether to refract global environmentMapLight, default reflection.
   * */
  get envMapModeRefract(): boolean {
    return this._envMapModeRefract;
  }

  set envMapModeRefract(v: boolean) {
    this._envMapModeRefract = v;

    if (v) {
      this.shaderData.enableMacro("ENVMAPMODE_REFRACT");
    } else {
      this.shaderData.disableMacro("ENVMAPMODE_REFRACT");
    }
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

    this.shaderData.disableMacro("ALPHA_CUTOFF");
    this.shaderData.disableMacro("ALPHA_BLEND");

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
          this.shaderData.enableMacro("ALPHA_BLEND");
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = false;
          this.renderQueueType = RenderQueueType.Transparent;
        }
        break;
      case AlphaMode.CutOff:
        {
          this.shaderData.enableMacro("ALPHA_CUTOFF");
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.One;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.Zero;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = true;
          this.renderQueueType = RenderQueueType.AlphaTest;
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

  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _metallicFactor: number = 1;
  private _roughnessFactor: number = 1;
  private _normalScale: number = 1;
  private _emissiveColor = new Color(0, 0, 0, 1);
  private _occlusionStrength: number = 1;
  private _alphaCutoff: number = 0.5;
  private _specularColor = new Color(1, 1, 1, 1);
  private _glossinessFactor: number = 0;
  private _envMapIntensity: number = 1;
  private _refractionRatio: number = 1 / 1.33;
  private _refractionDepth: number = 1;
  private _perturbationUOffset: number = 0;
  private _perturbationVOffset: number = 0;
  private _PTMMatrix = new Matrix(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);
  private _baseColorTexture: Texture2D;
  private _opacityTexture: Texture2D;
  private _metallicTexture: Texture2D;
  private _roughnessTexture: Texture2D;
  private _metallicRoughnessTexture: Texture2D;
  private _normalTexture: Texture2D;
  private _emissiveTexture: Texture2D;
  private _occlusionTexture: Texture2D;
  private _specularGlossinessTexture: Texture2D;
  private _reflectionTexture: TextureCubeMap;
  private _refractionTexture: Texture2D;
  private _perturbationTexture: Texture2D;

  private _unLight: boolean = false;
  private _srgb: boolean = false;
  private _srgbFast: boolean = false;
  private _gamma: boolean = false;
  private _getOpacityFromRGB: boolean = false;
  private _isMetallicWorkflow: boolean = true;
  private _envMapModeRefract: boolean = false;
  private _alphaMode: AlphaMode = AlphaMode.Opaque;
  private _doubleSided: boolean = false;

  constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));
    this.shaderData.enableMacro("O3_NEED_WORLDPOS");

    this.baseColor = this._baseColor;
    this.metallicFactor = this._metallicFactor;
    this.roughnessFactor = this._roughnessFactor;
    this.normalScale = this._normalScale;
    this.emissiveColor = this._emissiveColor;
    this.occlusionStrength = this._occlusionStrength;
    this.alphaCutoff = this._alphaCutoff;
    this.specularColor = this._specularColor;
    this.glossinessFactor = this._glossinessFactor;
    this.envMapIntensity = this._envMapIntensity;
    this.refractionRatio = this._refractionRatio;
    this.refractionDepth = this._refractionDepth;
    this.perturbationUOffset = this._perturbationUOffset;
    this.perturbationVOffset = this._perturbationVOffset;

    this.unLight = this._unLight;
    this.srgb = this._srgb;
    this.srgbFast = this._srgbFast;
    this.gamma = this._gamma;
    this.getOpacityFromRGB = this._getOpacityFromRGB;
    this.isMetallicWorkflow = this._isMetallicWorkflow;
    this.envMapModeRefract = this._envMapModeRefract;
    this.alphaMode = this._alphaMode;
  }

  clone(): PBRMaterial {
    const dest = new PBRMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
