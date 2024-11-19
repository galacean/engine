import { MathUtil, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ShaderProperty } from "../shader";
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
   * The iridescence intensity factor.
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
   * The index of refraction of the dielectric thin-film layer.
   * @defaultValue `1.3`
   */
  get iridescenceIor(): number {
    return this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp).y;
  }

  set iridescenceIor(value: number) {
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    iridescenceInfo.y = Math.max(value, 1.0);
  }

  /**
   * The minimum thickness of the thin-film layer given in nanometers.
   * @defaultValue `100`
   */
  get iridescenceThicknessMin(): number {
    return this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp).z;
  }

  set iridescenceThicknessMin(value: number) {
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    iridescenceInfo.z = value;
  }

  /**
   * The maximum thickness of the thin-film layer given in nanometers.
   * @defaultValue `400`
   */
  get iridescenceThicknessMax(): number {
    return this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp).w;
  }

  set iridescenceThicknessMax(value: number) {
    const iridescenceInfo = this.shaderData.getVector4(PBRMaterial._iridescenceInfoProp);
    iridescenceInfo.w = value;
  }

  /**
   * The thickness texture of the thin-film layer.
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
   * The iridescence intensity texture.
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
