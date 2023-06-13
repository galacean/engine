import { BaseMaterial, BlendMode, RenderFace } from "../material";
import { Shader } from "../shader";
import { Color, Vector4 } from "@oasis-engine/math";
import { Texture2D } from "../texture";
import { Engine } from "../Engine";

/**
 * @internal
 * Particle Material
 */
export class ParticleMaterial extends BaseMaterial {
  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(ParticleMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(ParticleMaterial._baseColorProp);
    if (value !== baseColor) {
      baseColor.copyFrom(value);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(ParticleMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    this.shaderData.setTexture(ParticleMaterial._baseTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(ParticleMaterial._baseTextureMacro);
    } else {
      this.shaderData.disableMacro(ParticleMaterial._baseTextureMacro);
    }
  }

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this.shaderData.getVector4(ParticleMaterial._tilingOffsetProp);
  }

  set tilingOffset(value: Vector4) {
    const tilingOffset = this.shaderData.getVector4(ParticleMaterial._tilingOffsetProp);
    if (value !== tilingOffset) {
      tilingOffset.copyFrom(value);
    }
  }

  /**
   * Create a particle material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("particle-shader"));
    this.renderFace = RenderFace.Back;
    this.isTransparent = true;
    this.blendMode = BlendMode.Normal;
    const shaderData = this.shaderData;

    shaderData.enableMacro("OMIT_NORMAL");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor(ParticleMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setVector4(ParticleMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));
  }

  /**
   * @override
   */
  clone(): ParticleMaterial {
    const dest = new ParticleMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
