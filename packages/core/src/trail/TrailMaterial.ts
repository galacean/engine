import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { BaseMaterial } from "../material/BaseMaterial";
import { BlendFactor, CullMode, Shader } from "../shader";
import { Texture2D } from "../texture";

/**
 * Trail material.
 */
export class TrailMaterial extends BaseMaterial {
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
   * Create a trail material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("trail"));

    const shaderData = this.shaderData;
    shaderData.setColor(BaseMaterial._baseColorProp, new Color(1, 1, 1, 1));

    // Default blend state for additive blending
    const target = this.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.One;
    target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationAlphaBlendFactor = BlendFactor.One;

    // Disable depth write for transparent rendering
    this.renderState.depthState.writeEnabled = false;

    // Disable culling for double-sided rendering
    this.renderState.rasterState.cullMode = CullMode.Off;
  }

  /**
   * @inheritdoc
   */
  override clone(): TrailMaterial {
    const dest = new TrailMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
