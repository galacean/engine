import { Color } from "@galacean/engine-math";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class ColorOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _gradientMacro = ShaderMacro.getByName("RENDERER_COL_GRADIENT");
  static readonly _randomGradientsMacro = ShaderMacro.getByName("RENDERER_COL_RANDOM_GRADIENTS");

  static readonly _minGradientColor = ShaderProperty.getByName("renderer_COLMinGradientColor");
  static readonly _minGradientAlpha = ShaderProperty.getByName("renderer_COLMinGradientAlpha");
  static readonly _maxGradientColor = ShaderProperty.getByName("renderer_COLMaxGradientColor");
  static readonly _maxGradientAlpha = ShaderProperty.getByName("renderer_COLMaxGradientAlpha");

  /** Specifies whether the rotation is separate on each axis, when disabled only x axis is used and applied to all axes. */
  separateAxes: boolean = false;
  /** Rotation over lifetime for z axis. */
  color: ParticleCompositeGradient = new ParticleCompositeGradient(new Color(1, 1, 1, 1));

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
      }
    }

    this._enableModuleMacro(shaderData, colorMacro);
  }
}
