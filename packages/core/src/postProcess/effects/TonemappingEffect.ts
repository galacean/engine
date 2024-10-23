import { Material } from "../../material";
import { ShaderMacro } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";

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
  private static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_TONEMAPPING");

  private _mode: TonemappingMode;

  /**
   * Use this to select a tonemapping algorithm to use.
   */
  get mode(): TonemappingMode {
    return this._mode;
  }

  set mode(value: TonemappingMode) {
    if (value !== this._mode) {
      this._mode = value;
      this._uberMaterial.shaderData.enableMacro("TONEMAPPING_MODE", value.toString());
    }
  }

  constructor(private _uberMaterial: Material) {
    super();
    this.mode = TonemappingMode.Neutral;
  }

  /**
   *  @inheritdoc
   */
  override onEnable() {
    this._uberMaterial.shaderData.enableMacro(TonemappingEffect._enableMacro);
  }

  /**
   *  @inheritdoc
   */
  override onDisable() {
    this._uberMaterial.shaderData.disableMacro(TonemappingEffect._enableMacro);
  }
}
