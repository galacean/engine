import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { BaseMaterial } from "../material/BaseMaterial";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";

/**
 * Particle Material.
 */
export class ParticleMaterial extends BaseMaterial {
  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(BaseMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(BaseMaterial._baseColorProp);
    if (value !== baseColor) {
      baseColor.copyFrom(value);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BaseMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    this.shaderData.setTexture(BaseMaterial._baseTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(BaseMaterial._baseTextureMacro);
    } else {
      this.shaderData.disableMacro(BaseMaterial._baseTextureMacro);
    }
  }

  /**
   * Create a unlit material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("particle-shader"));

    const shaderData = this.shaderData;
    shaderData.setColor(BaseMaterial._baseColorProp, new Color(1, 1, 1, 1));

    this.isTransparent = true;
  }

  /**
   * @inheritdoc
   */
  override clone(): ParticleMaterial {
    const dest = new ParticleMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
