import { Vector2, Vector3 } from "@galacean/engine-math";
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

  private static _iorProp = Shader.getPropertyByName("material_IOR");

  private static _anisotropyInfoProp = ShaderProperty.getByName("material_AnisotropyInfo");
  private static _anisotropyTextureProp = ShaderProperty.getByName("material_AnisotropyTexture");
  private _anisotropyDirection = new Vector2();

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
   * The Amount of anisotropy. Scalar between −1 and 1.
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
   * The direction of the surface to control the shape of the specular highlights
   */
  get anisotropyDirection(): Vector2 {
    this._anisotropyDirection.copyFrom(this.shaderData.getVector3(PBRMaterial._anisotropyInfoProp));

    return this._anisotropyDirection;
  }

  set anisotropyDirection(value: Vector2) {
    if (value !== this._anisotropyDirection) {
      this._anisotropyDirection.copyFrom(value);
    }
  }

  /**
   * The anisotropy texture.
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
    // @ts-ignore
    this._anisotropyDirection._onValueChanged = this._onAnisotropyDirectionChanged.bind(this);
  }

  /**
   * @inheritdoc
   */
  override clone(): PBRMaterial {
    const dest = new PBRMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }

  private _onAnisotropyDirectionChanged(): void {
    const anisotropyInfo = this.shaderData.getVector3(PBRMaterial._anisotropyInfoProp);
    anisotropyInfo.x = this._anisotropyDirection.x;
    anisotropyInfo.y = this._anisotropyDirection.y;
  }
}
