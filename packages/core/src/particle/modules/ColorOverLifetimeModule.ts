import { Color, Vector4 } from "@galacean/engine-math";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { AlphaKey, ColorKey, ParticleGradient } from "./ParticleGradient";

/**
 * Color over lifetime module.
 */
export class ColorOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _gradientMacro = ShaderMacro.getByName("RENDERER_COL_GRADIENT");
  static readonly _randomGradientsMacro = ShaderMacro.getByName("RENDERER_COL_RANDOM_GRADIENTS");

  static readonly _minGradientColor = ShaderProperty.getByName("renderer_COLMinGradientColor");
  static readonly _minGradientAlpha = ShaderProperty.getByName("renderer_COLMinGradientAlpha");
  static readonly _maxGradientColor = ShaderProperty.getByName("renderer_COLMaxGradientColor");
  static readonly _maxGradientAlpha = ShaderProperty.getByName("renderer_COLMaxGradientAlpha");
  static readonly _gradientKeysLength = ShaderProperty.getByName("renderer_COLGradientKeysLength");

  /** Color gradient over lifetime. */
  color = new ParticleCompositeGradient(
    new ParticleGradient([new ColorKey(0.5, new Color(1, 0, 0))], [new AlphaKey(0, 1), new AlphaKey(1, 0)])
  );

  private _gradientKeysLength = new Vector4(0, 0, 0, 0); // x: minColorKeysLength, y: minAlphaKeysLength, z: maxColorKeysLength, w: maxAlphaKeysLength

  /**
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: ColorOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let colorMacro = <ShaderMacro>null;
    if (this.enabled) {
      const mode = this.color.mode;

      if (mode === ParticleGradientMode.Gradient || mode === ParticleGradientMode.TwoGradients) {
        const color = this.color;
        shaderData.setFloatArray(ColorOverLifetimeModule._maxGradientColor, color.gradientMax._getColorTypeArray());
        shaderData.setFloatArray(ColorOverLifetimeModule._maxGradientAlpha, color.gradientMax._getAlphaTypeArray());

        if (mode === ParticleGradientMode.Gradient) {
          colorMacro = ColorOverLifetimeModule._gradientMacro;
        } else {
          shaderData.setFloatArray(ColorOverLifetimeModule._minGradientColor, color.gradientMin._getColorTypeArray());
          shaderData.setFloatArray(ColorOverLifetimeModule._minGradientAlpha, color.gradientMin._getAlphaTypeArray());
          colorMacro = ColorOverLifetimeModule._randomGradientsMacro;
        }

        this._gradientKeysLength.set(
          color.gradientMin.colorKeys.length,
          color.gradientMin.alphaKeys.length,
          color.gradientMax.colorKeys.length,
          color.gradientMax.alphaKeys.length
        );
        shaderData.setVector4(ColorOverLifetimeModule._gradientKeysLength, this._gradientKeysLength);
      }
    }

    this._enableModuleMacro(shaderData, colorMacro);
  }
}
