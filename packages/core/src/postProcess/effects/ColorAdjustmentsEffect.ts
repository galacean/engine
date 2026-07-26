import { Vector3 } from "@galacean/engine-math";
import { ShaderMacro, ShaderProperty } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";
import { PostProcessEffectFloatParameter } from "../PostProcessEffectParameter";

/**
 * HDR exposure and linear white-balance controls executed by the existing Uber pass.
 */
export class ColorAdjustmentsEffect extends PostProcessEffect {
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_COLOR_ADJUSTMENTS");
  /** @internal */
  static _postExposureProperty: ShaderProperty = ShaderProperty.getByName("material_PostExposure");
  /** @internal */
  static _whiteBalanceProperty: ShaderProperty = ShaderProperty.getByName("material_WhiteBalance");

  /** Exposure compensation in EV stops. */
  postExposure = new PostProcessEffectFloatParameter(0, -10, 10);
  /** White-balance temperature in the artist-facing range [-100, 100]. */
  temperature = new PostProcessEffectFloatParameter(0, -100, 100);
  /** White-balance green/magenta tint in the artist-facing range [-100, 100]. */
  tint = new PostProcessEffectFloatParameter(0, -100, 100);

  /** @inheritdoc */
  override isValid(): boolean {
    return this.enabled;
  }

  /** @internal */
  static _computeWhiteBalance(temperature: number, tint: number, out: Vector3): Vector3 {
    const normalizedTemperature = temperature / 100;
    const normalizedTint = tint / 100;
    const t1 = (normalizedTemperature * 10) / 6;
    const t2 = (normalizedTint * 10) / 6;
    const x = 0.31271 - t1 * (t1 < 0 ? 0.1 : 0.05);
    const y = standardIlluminantY(x) + t2 * 0.05;
    const reference = ciexyToLms(0.31271, 0.32902, ColorAdjustmentsEffectTemp.reference);
    const target = ciexyToLms(x, y, ColorAdjustmentsEffectTemp.target);
    out.set(reference.x / target.x, reference.y / target.y, reference.z / target.z);
    return out;
  }
}

function standardIlluminantY(x: number): number {
  return 2.87 * x - 3 * x * x - 0.27509507;
}

function ciexyToLms(x: number, y: number, out: Vector3): Vector3 {
  y = Math.max(y, 1e-5);
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  out.set(
    0.7328 * X + 0.4296 * Y - 0.1624 * Z,
    -0.7036 * X + 1.6975 * Y + 0.0061 * Z,
    0.003 * X + 0.0136 * Y + 0.9834 * Z
  );
  return out;
}

const ColorAdjustmentsEffectTemp = {
  reference: new Vector3(),
  target: new Vector3()
};
