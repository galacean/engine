import { Color, Rand, Vector4 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { GradientAlphaKey, GradientColorKey, ParticleGradient } from "./ParticleGradient";

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
  static readonly _gradientKeysCount = ShaderProperty.getByName("renderer_COLGradientKeysMaxTime");

  /** Color gradient over lifetime. */
  @deepClone
  color = new ParticleCompositeGradient(
    new ParticleGradient(
      [new GradientColorKey(0.0, new Color(1, 1, 1)), new GradientColorKey(1.0, new Color(1, 1, 1))],
      [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
    )
  );

  /** @internal */
  @ignoreClone
  _colorGradientRand = new Rand(0, ParticleRandomSubSeeds.ColorOverLifetime);

  @ignoreClone
  private _gradientKeysCount = new Vector4(0, 0, 0, 0); // x: minColorKeysMaxTime, y: minAlphaKeysMaxTime, z: maxColorKeysMaxTime, w: maxAlphaKeysMaxTime
  @ignoreClone
  private _colorMacro: ShaderMacro;

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let colorMacro = <ShaderMacro>null;
    if (this.enabled) {
      const mode = this.color.mode;

      if (mode === ParticleGradientMode.Gradient || mode === ParticleGradientMode.TwoGradients) {
        const color = this.color;
        const colorSpace = this._generator._renderer.engine.settings.colorSpace;
        shaderData.setFloatArray(
          ColorOverLifetimeModule._maxGradientColor,
          color.gradientMax._getColorTypeArray(colorSpace)
        );
        shaderData.setFloatArray(ColorOverLifetimeModule._maxGradientAlpha, color.gradientMax._getAlphaTypeArray());

        if (mode === ParticleGradientMode.Gradient) {
          colorMacro = ColorOverLifetimeModule._gradientMacro;
        } else {
          shaderData.setFloatArray(
            ColorOverLifetimeModule._minGradientColor,
            color.gradientMin._getColorTypeArray(colorSpace)
          );
          shaderData.setFloatArray(ColorOverLifetimeModule._minGradientAlpha, color.gradientMin._getAlphaTypeArray());
          colorMacro = ColorOverLifetimeModule._randomGradientsMacro;
        }

        const colorMinKeys = color.gradientMin.colorKeys;
        const alphaMinKeys = color.gradientMin.alphaKeys;
        const colorMaxKeys = color.gradientMax.colorKeys;
        const alphaMaxKeys = color.gradientMax.alphaKeys;

        this._gradientKeysCount.set(
          colorMinKeys.length ? colorMinKeys[colorMinKeys.length - 1].time : 0,
          alphaMinKeys.length ? alphaMinKeys[alphaMinKeys.length - 1].time : 0,
          colorMaxKeys.length ? colorMaxKeys[colorMaxKeys.length - 1].time : 0,
          alphaMaxKeys.length ? alphaMaxKeys[alphaMaxKeys.length - 1].time : 0
        );
        shaderData.setVector4(ColorOverLifetimeModule._gradientKeysCount, this._gradientKeysCount);
      }
    }

    this._colorMacro = this._enableMacro(shaderData, this._colorMacro, colorMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._colorGradientRand.reset(seed, ParticleRandomSubSeeds.ColorOverLifetime);
  }
}
