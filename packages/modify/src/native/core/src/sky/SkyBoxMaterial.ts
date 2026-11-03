import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCube } from "../texture";

/**
 * SkyBoxMaterial.
 */
export class SkyBoxMaterial extends Material {
  private static _tintColorProp = ShaderProperty.getByName("material_TintColor");
  private static _textureCubeProp = ShaderProperty.getByName("material_CubeTexture");
  private static _secondaryTextureCubeProp = ShaderProperty.getByName("material_CubeTexture2");
  private static _textureBlendProp = ShaderProperty.getByName("material_CubeTextureBlend");
  private static _rotationProp = ShaderProperty.getByName("material_Rotation");
  private static _exposureProp = ShaderProperty.getByName("material_Exposure");
  private static _secondaryTextureMacro = ShaderMacro.getByName("MATERIAL_HAS_SECONDARY_CUBE_TEXTURE");

  private _tintColor: Color = new Color(1, 1, 1, 1);

  /**
   * Texture of the sky box material.
   */
  get texture(): TextureCube {
    return this.shaderData.getTexture(SkyBoxMaterial._textureCubeProp) as TextureCube;
  }

  set texture(value: TextureCube) {
    this.shaderData.setTexture(SkyBoxMaterial._textureCubeProp, value);
  }

  /** Optional second sky texture used for GPU-side environment transitions. */
  get secondaryTexture(): TextureCube | null {
    return this.shaderData.getTexture(SkyBoxMaterial._secondaryTextureCubeProp) as TextureCube | null;
  }

  set secondaryTexture(value: TextureCube | null) {
    this.shaderData.setTexture(SkyBoxMaterial._secondaryTextureCubeProp, value);
    if (value) {
      this.shaderData.enableMacro(SkyBoxMaterial._secondaryTextureMacro);
    } else {
      this.shaderData.disableMacro(SkyBoxMaterial._secondaryTextureMacro);
    }
  }

  /** Blend weight from {@link texture} to {@link secondaryTexture}. */
  get textureBlend(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._textureBlendProp);
  }

  set textureBlend(value: number) {
    this.shaderData.setFloat(SkyBoxMaterial._textureBlendProp, Math.max(0, Math.min(1, value)));
  }

  /**
   * The angle to rotate around the y-axis, unit is degree.
   */
  get rotation(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._rotationProp);
  }

  set rotation(value: number) {
    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, value);
  }

  /**
   * The exposure value of this material.
   */
  get exposure(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._exposureProp);
  }

  set exposure(value: number) {
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, value);
  }

  /**
   * The Tint color of this material.
   */
  get tintColor(): Color {
    return this._tintColor;
  }

  set tintColor(value: Color) {
    if (this._tintColor != value) {
      this._tintColor.copyFrom(value);
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("Sky/Skybox"));

    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, 0);
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, 1);
    this.shaderData.setFloat(SkyBoxMaterial._textureBlendProp, 0);
    this.shaderData.setColor(SkyBoxMaterial._tintColorProp, this._tintColor);
  }

  override clone(): SkyBoxMaterial {
    const dest = new SkyBoxMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
