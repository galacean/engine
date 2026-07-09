import { BlendFactor, Engine, Material, Shader, ShaderProperty, Texture2D } from "@galacean/engine";
import { SpineBlendMode } from "../enums/SpineBlendMode";

const { SourceAlpha, One, DestinationColor, OneMinusSourceColor, OneMinusSourceAlpha } = BlendFactor;

/**
 * Material for spine rendering.
 *
 * @remarks
 * The shader lives as a built-in engine shader (`2D/Spine`, registered by the engine's
 * `ShaderPool`). Per-material blend factors are driven through shader data properties
 * (`sourceColorBlendFactor` etc.), which the `2D/Spine` shader binds into its `BlendState`.
 * The constant render state (transparent queue, depth-write off, cull off) is declared in
 * the shader, so this material only varies the blend factors per blend mode.
 */
export class SpineMaterial extends Material {
  private static _sourceColorBlendFactorProp = ShaderProperty.getByName("sourceColorBlendFactor");
  private static _destinationColorBlendFactorProp = ShaderProperty.getByName("destinationColorBlendFactor");
  private static _sourceAlphaBlendFactorProp = ShaderProperty.getByName("sourceAlphaBlendFactor");
  private static _destinationAlphaBlendFactorProp = ShaderProperty.getByName("destinationAlphaBlendFactor");

  /**
   * @internal
   * The key this material is registered under in `SpineAnimationRenderer._materialCacheMap`.
   */
  _cacheKey: string;

  private _blendMode: SpineBlendMode = SpineBlendMode.Normal;

  /**
   * @internal
   */
  _setTintBlack(enabled: boolean) {
    if (enabled) {
      this.shaderData.enableMacro("RENDERER_TINT_BLACK");
    } else {
      this.shaderData.disableMacro("RENDERER_TINT_BLACK");
    }
  }

  /**
   * @internal
   */
  _setPremultipliedAlpha(enabled: boolean) {
    this.shaderData.setFloat("renderer_PremultipliedAlpha", enabled ? 1 : 0);
  }

  /**
   * @internal
   */
  _setTexture(value: Texture2D) {
    this.shaderData.setTexture("material_SpineTexture", value);
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("2D/Spine"));
    this._setBlendMode(SpineBlendMode.Normal, false);
  }

  /**
   * @internal
   */
  _setBlendMode(blendMode: SpineBlendMode, premultipliedAlpha: boolean) {
    const { shaderData } = this;
    const {
      _sourceColorBlendFactorProp: srcColor,
      _destinationColorBlendFactorProp: dstColor,
      _sourceAlphaBlendFactorProp: srcAlpha,
      _destinationAlphaBlendFactorProp: dstAlpha
    } = SpineMaterial;
    this._blendMode = blendMode;
    switch (blendMode) {
      case SpineBlendMode.Additive:
        shaderData.setInt(srcColor, premultipliedAlpha ? One : SourceAlpha);
        shaderData.setInt(dstColor, One);
        shaderData.setInt(srcAlpha, One);
        shaderData.setInt(dstAlpha, One);
        break;
      case SpineBlendMode.Multiply:
        shaderData.setInt(srcColor, DestinationColor);
        shaderData.setInt(dstColor, OneMinusSourceAlpha);
        shaderData.setInt(srcAlpha, One);
        shaderData.setInt(dstAlpha, OneMinusSourceAlpha);
        break;
      case SpineBlendMode.Screen:
        shaderData.setInt(srcColor, One);
        shaderData.setInt(dstColor, OneMinusSourceColor);
        shaderData.setInt(srcAlpha, One);
        shaderData.setInt(dstAlpha, OneMinusSourceColor);
        break;
      default: // Normal
        shaderData.setInt(srcColor, premultipliedAlpha ? One : SourceAlpha);
        shaderData.setInt(dstColor, OneMinusSourceAlpha);
        shaderData.setInt(srcAlpha, One);
        shaderData.setInt(dstAlpha, OneMinusSourceAlpha);
        break;
    }
  }

  /**
   * @internal
   */
  _getBlendMode(): SpineBlendMode {
    return this._blendMode;
  }
}
