import { ShaderMacro } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";
import { PostProcessEffectParameter } from "../PostProcessEffectParameter";

/**
 * Options to select a tonemapping algorithm to use.
 */
export enum TonemappingMode {
  /**
   * Neutral tonemapper
   * @remarks Use this option if you only want range-remapping with minimal impact on color hue and saturation.
   */
  Neutral,

  /**
   * ACES Filmic reference tonemapper (custom approximation)
   * @remarks
   * Use this option to apply a close approximation of the reference ACES tonemapper for a more filmic look.
   * It is more contrasted than Neutral and has an effect on actual color hue and saturation.
   */
  ACES
}

export class TonemappingEffect extends PostProcessEffect {
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_TONEMAPPING");

  /**
   * Use this to select a tonemapping algorithm to use.
   */
  mode = new PostProcessEffectParameter(TonemappingMode.Neutral, false);
}
