import { Matrix, Vector3 } from "@galacean/engine-math";
import { ShaderMacro, ShaderProperty } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";
import { PostProcessEffectFloatParameter } from "../PostProcessEffectParameter";

const LINEAR_TO_LMS = [0.390405, 0.549941, 0.00892632, 0.0708416, 0.963172, 0.00135775, 0.0231082, 0.128021, 0.936245];

const LMS_TO_LINEAR = [2.85847, -1.62879, -0.024891, -0.210182, 1.1582, 0.000324281, -0.041812, -0.118169, 1.06867];

/**
 * HDR exposure, white-balance, contrast, and saturation controls executed by the Uber pass.
 */
export class ColorAdjustmentsEffect extends PostProcessEffect {
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_COLOR_ADJUSTMENTS");
  /** @internal */
  static _whiteBalanceMatrixProperty: ShaderProperty = ShaderProperty.getByName("material_WhiteBalanceMatrix");
  /** @internal */
  static _adjustmentsProperty: ShaderProperty = ShaderProperty.getByName("material_ColorAdjustments");

  /** Exposure compensation in EV stops. */
  postExposure = new PostProcessEffectFloatParameter(0, -10, 10);
  /** White-balance temperature in the artist-facing range [-100, 100]. */
  temperature = new PostProcessEffectFloatParameter(0, -100, 100);
  /** White-balance green/magenta tint in the artist-facing range [-100, 100]. */
  tint = new PostProcessEffectFloatParameter(0, -100, 100);
  /** Contrast in ARRI LogC space around middle gray in the artist-facing range [-100, 100]. */
  contrast = new PostProcessEffectFloatParameter(0, -100, 100);
  /** Luminance-preserving saturation in the artist-facing range [-100, 100]. */
  saturation = new PostProcessEffectFloatParameter(0, -100, 100);

  /** @inheritdoc */
  override isValid(): boolean {
    return (
      this.enabled &&
      (this.postExposure.value !== 0 ||
        this.temperature.value !== 0 ||
        this.tint.value !== 0 ||
        this.contrast.value !== 0 ||
        this.saturation.value !== 0)
    );
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

  /**
   * Pre-multiply `LMS_TO_LINEAR * diag(whiteBalance) * LINEAR_TO_LMS` into a single 3x3 matrix
   * stored in the upper-left of `out` so the fragment shader applies white balance in one `mat3` multiply.
   * @internal
   */
  static _computeWhiteBalanceMatrix(temperature: number, tint: number, out: Matrix): Matrix {
    out.identity();
    if (temperature === 0 && tint === 0) {
      return out;
    }

    const wb = ColorAdjustmentsEffect._computeWhiteBalance(temperature, tint, ColorAdjustmentsEffectTemp.balance);
    const e = out.elements;
    const A = LINEAR_TO_LMS;
    const B = LMS_TO_LINEAR;
    const wx = wb.x;
    const wy = wb.y;
    const wz = wb.z;

    for (let col = 0; col < 3; col++) {
      const a0 = A[col] * wx;
      const a1 = A[3 + col] * wy;
      const a2 = A[6 + col] * wz;
      const base = col * 4;
      e[base] = B[0] * a0 + B[1] * a1 + B[2] * a2;
      e[base + 1] = B[3] * a0 + B[4] * a1 + B[5] * a2;
      e[base + 2] = B[6] * a0 + B[7] * a1 + B[8] * a2;
    }

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
  target: new Vector3(),
  balance: new Vector3()
};
