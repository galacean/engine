import { MathUtil, Vector2, Vector3, Vector4, Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ShaderMacro, ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { PBRBaseMaterial } from "./PBRBaseMaterial";

/**
 * PBR (Metallic-Roughness Workflow) Material.
 */
export class PBRMaterial extends PBRBaseMaterial {
  private static _metallicProp = ShaderProperty.getByName("material_Metal");
  private static _roughnessProp = ShaderProperty.getByName("material_Roughness");
  private static _roughnessMetallicTextureProp = ShaderProperty.getByName("material_RoughnessMetallicTexture");

  private static _iorProp = ShaderProperty.getByName("material_IOR");

  private static _anisotropyInfoProp = ShaderProperty.getByName("material_AnisotropyInfo");
  private static _anisotropyTextureProp = ShaderProperty.getByName("material_AnisotropyTexture");

  private _anisotropyRotation: number = 0;

  private static _iridescenceInfoProp = ShaderProperty.getByName("material_IridescenceInfo");
  private static _iridescenceThicknessTextureProp = ShaderProperty.getByName("material_IridescenceThicknessTexture");
  private static _iridescenceTextureProp = ShaderProperty.getByName("material_IridescenceTexture");
  private _iridescenceRange = new Vector2(100, 400);

  private _sheenEnabled = false;
  private static _sheenColorProp = ShaderProperty.getByName("material_SheenColor");
  private static _sheenRoughnessProp = ShaderProperty.getByName("material_SheenRoughness");
  private static _sheenTextureProp = ShaderProperty.getByName("material_SheenTexture");
  private static _sheenRoughnessTextureProp = ShaderProperty.getByName("material_SheenRoughnessTexture");

  private _refractionEnabled = false;
  private static _refactionMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_ENABLE_SS_REFRACTION");
  private static _transmissionProp = ShaderProperty.getByName("material_Transmission");
  private static _transmissionTextureProp = ShaderProperty.getByName("material_TransmissionTexture");
  private static _attenuationColorProp = ShaderProperty.getByName("material_AttenuationColor");
  private static _attenuationDistanceProp = ShaderProperty.getByName("material_AttenuationDistance");
  private static _thicknessProp = ShaderProperty.getByName("material_Thickness");
  private static _thicknessTextureProp = ShaderProperty.getByName("material_ThicknessTexture");
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
  get metallic(): number {
    return this.shaderData.getFloat(PBRMaterial._metallicProp);
  }

  set metallic(value: number) {
    this.shaderData.setFloat(PBRMaterial._metallicProp, value);
  }

  /**
   * Roughness. default 1.0.
   * @defaultValue `1.0`
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
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._roughnessMetallicTextureProp);
  }

  set roughnessMetallicTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._roughnessMetallicTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
    }
  }

  /**
   * The strength of anisotropy, when anisotropyTexture is present, this value is multiplied by the blue channel.
   * @defaultValue `0`
   */
  get anisotropy(): number {
    return this.shaderData.getVector3(PBRMaterial._anisotropyInfoProp).z;
  }

  set anisotropy(value: number) {
    const anisotropyInfo = this.shaderData.getVector3(PBRMaterial._anisotropyInfoProp);
    if (!!anisotropyInfo.z !== !!value) {
      if (value === 0) {
        this.shaderData.disableMacro("MATERIAL_ENABLE_ANISOTROPY");
      } else {
        this.shaderData.enableMacro("MATERIAL_ENABLE_ANISOTROPY");
      }
    }
    anisotropyInfo.z = value;
  }

  /**
   * The rotation of the anisotropy in tangent, bitangent space, value in degrees.
   * @defaultValue `0`
   */
  get anisotropyRotation(): number {
    return this._anisotropyRotation;
  }

  set anisotropyRotation(value: number) {
    if (this._anisotropyRotation !== value) {
      this._anisotropyRotation = value;

      const anisotropyInfo = this.shaderData.getVector3(PBRMaterial._anisotropyInfoProp);
      const rad = MathUtil.degreeToRadFactor * value;
      anisotropyInfo.x = Math.cos(rad);
      anisotropyInfo.y = Math.sin(rad);
    }
  }

  /**
   * The anisotropy texture.
   * @remarks
   * Red and green channels represent the anisotropy direction in [-1, 1] tangent, bitangent space, to be rotated by anisotropyRotation.
   * The blue channel contains strength as [0, 1] to be multiplied by anisotropy.
   */
  get anisotropyTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._anisotropyTextureProp);
  }

  set anisotropyTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._anisotropyTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_ANISOTROPY_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_ANISOTROPY_TEXTURE");
    }
  }

  /**
   * The iridescence intensity factor, from 0.0 to 1.0.
   * @defaultValue `0.0`
   */
  get iridescence(): number {
    return this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp).x;
  }

  set iridescence(value: number) {
    value = Math.max(0, Math.min(1, value));
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    if (!!iridescenceInfo.x !== !!value) {
      if (value === 0) {
        this.shaderData.disableMacro("MATERIAL_ENABLE_IRIDESCENCE");
      } else {
        this.shaderData.enableMacro("MATERIAL_ENABLE_IRIDESCENCE");
      }
    }
    iridescenceInfo.x = value;
  }

  /**
   * The iridescence intensity texture, sampling red channel, and multiply 'iridescence'.
   */
  get iridescenceTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._iridescenceTextureProp);
  }

  set iridescenceTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._iridescenceTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_IRIDESCENCE_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_IRIDESCENCE_TEXTURE");
    }
  }

  /**
   * The index of refraction of the dielectric thin-film layer, greater than or equal to 1.0.
   * @defaultValue `1.3`
   */
  get iridescenceIOR(): number {
    return this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp).y;
  }

  set iridescenceIOR(value: number) {
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    iridescenceInfo.y = Math.max(value, 1.0);
  }

  /**
   * The range of iridescence thickness, x is minimum, y is maximum.
   *  @defaultValue `[100, 400]`
   */
  get iridescenceThicknessRange(): Vector2 {
    return this._iridescenceRange;
  }

  set iridescenceThicknessRange(value: Vector2) {
    if (this._iridescenceRange !== value) {
      this._iridescenceRange.copyFrom(value);
    }
  }

  /**
   * The thickness texture of the thin-film layer, sampling green channel.
   * @remarks
   * If iridescenceThicknessTexture is defined, iridescence thickness between the 'iridescenceThicknessRange'.
   * If iridescenceThicknessTexture is not defined, iridescence thickness will use only 'iridescenceThicknessRange.y'.
   */
  get iridescenceThicknessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._iridescenceThicknessTextureProp);
  }

  set iridescenceThicknessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._iridescenceThicknessTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE");
    }
  }

  /**
   * Sheen color.
   * @defaultValue `[0,0,0]`
   */
  get sheenColor(): Color {
    return this.shaderData.getColor(PBRMaterial._sheenColorProp);
  }

  set sheenColor(value: Color) {
    const sheenColor = this.shaderData.getColor(PBRMaterial._sheenColorProp);
    if (value !== sheenColor) {
      sheenColor.copyFrom(value);
    }
  }

  /**
   * Sheen roughness, from 0.0 to 1.0.
   * @defaultValue `0.0`
   */
  get sheenRoughness(): number {
    return this.shaderData.getFloat(PBRMaterial._sheenRoughnessProp);
  }

  set sheenRoughness(value: number) {
    value = Math.max(0, Math.min(1, value));
    this.shaderData.setFloat(PBRMaterial._sheenRoughnessProp, value);
  }

  /**
   * Sheen color texture, multiply ‘sheenColor’.
   */
  get sheenColorTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._sheenTextureProp);
  }

  set sheenColorTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._sheenTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_SHEEN_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_SHEEN_TEXTURE");
    }
  }

  /**
   * Sheen roughness texture.
   * @remarks Use alpha channel, and multiply 'sheenRoughness'.
   */
  get sheenRoughnessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._sheenRoughnessTextureProp);
  }

  set sheenRoughnessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._sheenRoughnessTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE");
    }
  }

  /**
   * Refraction switch.
   */
  get enableRefraction(): boolean {
    return this._refractionEnabled;
  }

  set enableRefraction(value: boolean) {
    if (value !== this._refractionEnabled) {
      this._refractionEnabled = value;
      if (value) {
        this.shaderData.enableMacro(PBRMaterial._refactionMacro);
      } else {
        this.shaderData.disableMacro(PBRMaterial._refactionMacro);
      }
    }
  }

  /**
   * Transmission factor.
   * @defaultValue `0.0`
   */
  get transmission(): number {
    return this.shaderData.getFloat(PBRMaterial._transmissionProp);
  }

  set transmission(value: number) {
    this.shaderData.setFloat(PBRMaterial._transmissionProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_TRANSMISSION");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_TRANSMISSION");
    }
  }

  /**
   * Transmission texture.
   * @remarks Use red channel, and multiply 'transmission'.
   */
  get transmissionTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._transmissionTextureProp);
  }

  set transmissionTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._transmissionTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_TRANSMISSION_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_TRANSMISSION_TEXTURE");
    }
  }

  /**
   * Attenuation color.
   * @defaultValue `[1,1,1]`
   */
  get attenuationColor(): Color {
    return this.shaderData.getColor(PBRMaterial._attenuationColorProp);
  }

  set attenuationColor(value: Color) {
    const attenuationColor = this.shaderData.getColor(PBRMaterial._attenuationColorProp);
    if (value !== attenuationColor) {
      attenuationColor.copyFrom(value);
    }
  }

  /**
   * Attenuation distance, greater than 0.0.
   * @defaultValue `infinity`
   */
  get attenuationDistance(): number {
    return this.shaderData.getFloat(PBRMaterial._attenuationDistanceProp);
  }

  set attenuationDistance(value: number) {
    if (value <= 0) {
      throw new Error("attenuationDistance must be greater than 0.0");
    }
    this.shaderData.setFloat(PBRMaterial._attenuationDistanceProp, value);
  }

  /**
   * Thickness, greater than or equal to 0.0.
   * @defaultValue `0.0`
   */
  get thickness(): number {
    return this.shaderData.getFloat(PBRMaterial._thicknessProp);
  }

  set thickness(value: number) {
    value = Math.max(0, value);
    this.shaderData.setFloat(PBRMaterial._thicknessProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_THICKNESS");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_THICKNESS");
    }
  }

  /**
   * Thickness texture.
   * @remarks Use green channel, and multiply 'thickness', range is 0.0 to 1.0.
   */
  get thicknessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRMaterial._thicknessTextureProp);
  }

  set thicknessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRMaterial._thicknessTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_THICKNESS_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_THICKNESS_TEXTURE");
    }
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
    shaderData.setVector3(PBRMaterial._anisotropyInfoProp, new Vector3(1, 0, 0));
    shaderData.setVector4(PBRMaterial._iridescenceInfoProp, new Vector4(0, 1.3, 100, 400));
    const sheenColor = new Color(0, 0, 0);
    shaderData.setColor(PBRMaterial._sheenColorProp, sheenColor);
    const attenuationColor = new Color(1, 1, 1);
    shaderData.setColor(PBRMaterial._attenuationColorProp, attenuationColor);
    // @ts-ignore
    this._iridescenceRange._onValueChanged = this._onIridescenceRangeChanged.bind(this);
    // @ts-ignore
    sheenColor._onValueChanged = () => {
      const enableSheen = sheenColor.r + sheenColor.g + sheenColor.b > 0;
      if (enableSheen !== this._sheenEnabled) {
        this._sheenEnabled = enableSheen;
        if (enableSheen) {
          this.shaderData.enableMacro("MATERIAL_ENABLE_SHEEN");
        } else {
          this.shaderData.disableMacro("MATERIAL_ENABLE_SHEEN");
        }
      }
    };
    // @ts-ignore
    attenuationColor._onValueChanged = () => {
      const enableAbsorption = attenuationColor.r + attenuationColor.g + attenuationColor.b > 1;
      if (enableAbsorption) {
        this.shaderData.enableMacro("MATERIAL_HAS_ABSORPTION");
      } else {
        this.shaderData.disableMacro("MATERIAL_HAS_ABSORPTION");
      }
    };
  }

  private _onIridescenceRangeChanged(): void {
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    iridescenceInfo.z = this._iridescenceRange.x;
    iridescenceInfo.w = this._iridescenceRange.y;
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
