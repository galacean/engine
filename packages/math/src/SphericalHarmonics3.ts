import { IClone } from "@oasis-engine/design";
import { Color } from "./Color";
import { Vector3 } from "./Vector3";

/**
 * Use SH3 to represent irradiance environment maps efficiently, allowing for interactive rendering of diffuse objects under distant illumination.
 * @remarks
 * https://graphics.stanford.edu/papers/envmap/envmap.pdf
 * http://www.ppsloan.org/publications/StupidSH36.pdf
 * https://google.github.io/filament/Filament.md.html#annex/sphericalharmonics
 */
export class SphericalHarmonics3 implements IClone {
  static fromArray(shArray: number[]): SphericalHarmonics3 {
    if (shArray.length != 27) {
      console.error("sh coefficients must be as large as 27");
    }

    const sh = new SphericalHarmonics3();
    sh.y00 = new Color(shArray[0], shArray[1], shArray[2], 0);
    sh.y1_1 = new Color(shArray[3], shArray[4], shArray[5], 0);
    sh.y10 = new Color(shArray[6], shArray[7], shArray[8], 0);
    sh.y11 = new Color(shArray[9], shArray[10], shArray[11], 0);
    sh.y2_2 = new Color(shArray[12], shArray[13], shArray[14], 0);
    sh.y2_1 = new Color(shArray[15], shArray[16], shArray[17], 0);
    sh.y20 = new Color(shArray[18], shArray[19], shArray[20], 0);
    sh.y21 = new Color(shArray[21], shArray[22], shArray[23], 0);
    sh.y22 = new Color(shArray[24], shArray[25], shArray[26], 0);

    return sh;
  }

  private static _basisFunction = [
    0.282095, //  1/2 * Math.sqrt(1 / PI)

    -0.488603, // -1/2 * Math.sqrt(3 / PI)
    0.488603, //  1/2 * Math.sqrt(3 / PI)
    -0.488603, // -1/2 * Math.sqrt(3 / PI)

    1.092548, //  1/2 * Math.sqrt(15 / PI)
    -1.092548, // -1/2 * Math.sqrt(15 / PI)
    0.315392, //  1/4 * Math.sqrt(5 / PI)
    -1.092548, // -1/2 * Math.sqrt(15 / PI)
    0.546274 //  1/4 * Math.sqrt(15 / PI)
  ];

  private static _convolutionKernel = [
    3.141593, //  PI
    2.094395, // (2 * PI) / 3,
    0.785398 //   PI / 4
  ];

  private static _tempColor = new Color();

  /**  The Y(0, 0) coefficient of the SH3. */
  y00: Color = new Color(0, 0, 0, 0);
  /**  The Y(1, -1) coefficient of the SH3. */
  y1_1: Color = new Color(0, 0, 0, 0);
  /**  The Y(1, 0) coefficient of the SH3. */
  y10: Color = new Color(0, 0, 0, 0);
  /**  The Y(1, 1) coefficient of the SH3. */
  y11: Color = new Color(0, 0, 0, 0);
  /**  The Y(2, -2) coefficient of the SH3. */
  y2_2: Color = new Color(0, 0, 0, 0);
  /**  The Y(2, -1) coefficient of the SH3. */
  y2_1: Color = new Color(0, 0, 0, 0);
  /**  The Y(2, 0) coefficient of the SH3. */
  y20: Color = new Color(0, 0, 0, 0);
  /**  The Y(2, 1) coefficient of the SH3. */
  y21: Color = new Color(0, 0, 0, 0);
  /**  The Y(2, 2) coefficient of the SH3. */
  y22: Color = new Color(0, 0, 0, 0);

  private _coefficients: Float32Array = new Float32Array(27);

  /**
   * Get pre-scaled coefficients used in shader.
   * @remarks
   * Convert radiance to irradiance with the A_l which is convoluted by the cosine lobe and pre-scale the basis function.
   * Reference equation [4,5,6,7,8,9] from https://graphics.stanford.edu/papers/envmap/envmap.pdf
   */
  get preScaledCoefficients(): Float32Array {
    const kernel = SphericalHarmonics3._convolutionKernel;
    const basis = SphericalHarmonics3._basisFunction;
    const data = this._coefficients;

    /**
     * 1.  L -> E
     * 2.  E * basis
     */

    // l0
    data[0] = this.y00.r * kernel[0] * basis[0];
    data[1] = this.y00.g * kernel[0] * basis[0];
    data[2] = this.y00.b * kernel[0] * basis[0];

    // l1
    data[3] = this.y1_1.r * kernel[1] * basis[1];
    data[4] = this.y1_1.g * kernel[1] * basis[1];
    data[5] = this.y1_1.b * kernel[1] * basis[1];
    data[6] = this.y10.r * kernel[1] * basis[2];
    data[7] = this.y10.g * kernel[1] * basis[2];
    data[8] = this.y10.b * kernel[1] * basis[2];
    data[9] = this.y11.r * kernel[1] * basis[3];
    data[10] = this.y11.g * kernel[1] * basis[3];
    data[11] = this.y11.b * kernel[1] * basis[3];

    // l2
    data[12] = this.y2_2.r * kernel[2] * basis[4];
    data[13] = this.y2_2.g * kernel[2] * basis[4];
    data[14] = this.y2_2.b * kernel[2] * basis[4];
    data[15] = this.y2_1.r * kernel[2] * basis[5];
    data[16] = this.y2_1.g * kernel[2] * basis[5];
    data[17] = this.y2_1.b * kernel[2] * basis[5];
    data[18] = this.y20.r * kernel[2] * basis[6];
    data[19] = this.y20.g * kernel[2] * basis[6];
    data[20] = this.y20.b * kernel[2] * basis[6];
    data[21] = this.y21.r * kernel[2] * basis[7];
    data[22] = this.y21.g * kernel[2] * basis[7];
    data[23] = this.y21.b * kernel[2] * basis[7];
    data[24] = this.y22.r * kernel[2] * basis[8];
    data[25] = this.y22.g * kernel[2] * basis[8];
    data[26] = this.y22.b * kernel[2] * basis[8];

    return data;
  }

  /**
   * Add radiance to the SH3 in specified direction.
   * @remarks
   * Implements `EvalSHBasis` from [Projection from Cube maps] in http://www.ppsloan.org/publications/StupidSH36.pdf.
   *
   * @param color - Radiance color
   * @param direction - Radiance direction
   * @param solidAngle - Radiance solid angle, dA / (r^2)
   */
  addRadiance(color: Color, direction: Vector3, solidAngle: number): void {
    const basis = SphericalHarmonics3._basisFunction;
    const tempColor = SphericalHarmonics3._tempColor;
    const { x, y, z } = direction;

    color.scale(solidAngle);

    this.y00.add(Color.scale(color, basis[0], tempColor));

    this.y1_1.add(Color.scale(color, basis[1] * y, tempColor));
    this.y10.add(Color.scale(color, basis[2] * z, tempColor));
    this.y11.add(Color.scale(color, basis[3] * x, tempColor));

    this.y2_2.add(Color.scale(color, basis[4] * x * y, tempColor));
    this.y2_1.add(Color.scale(color, basis[5] * y * z, tempColor));
    this.y20.add(Color.scale(color, basis[6] * (3 * z * z - 1), tempColor));
    this.y21.add(Color.scale(color, basis[7] * x * z, tempColor));
    this.y22.add(Color.scale(color, basis[8] * (x * x - y * y), tempColor));
  }

  /**
   * Scale the coefficients.
   */
  scale(value: number) {
    this.y00.scale(value);
    this.y1_1.scale(value);
    this.y10.scale(value);
    this.y11.scale(value);
    this.y2_2.scale(value);
    this.y2_1.scale(value);
    this.y20.scale(value);
    this.y21.scale(value);
    this.y22.scale(value);
  }

  /**
   * Clear SH3 to zero.
   */
  clear(): void {
    this.y00.setValue(0, 0, 0, 0);
    this.y1_1.setValue(0, 0, 0, 0);
    this.y10.setValue(0, 0, 0, 0);
    this.y11.setValue(0, 0, 0, 0);
    this.y2_2.setValue(0, 0, 0, 0);
    this.y2_1.setValue(0, 0, 0, 0);
    this.y20.setValue(0, 0, 0, 0);
    this.y21.setValue(0, 0, 0, 0);
    this.y22.setValue(0, 0, 0, 0);
  }

  /**
   * Clone the value of this coefficients to an array.
   * @param out - The array
   */
  toArray(out: number[]): void {
    out[0] = this.y00.r;
    out[1] = this.y00.g;
    out[2] = this.y00.b;

    out[3] = this.y1_1.r;
    out[4] = this.y1_1.g;
    out[5] = this.y1_1.b;
    out[6] = this.y10.r;
    out[7] = this.y10.g;
    out[8] = this.y10.b;
    out[9] = this.y11.r;
    out[10] = this.y11.g;
    out[11] = this.y11.b;

    out[12] = this.y2_2.r;
    out[13] = this.y2_2.g;
    out[14] = this.y2_2.b;
    out[15] = this.y2_1.r;
    out[16] = this.y2_1.g;
    out[17] = this.y2_1.b;
    out[18] = this.y20.r;
    out[19] = this.y20.g;
    out[20] = this.y20.b;
    out[21] = this.y21.r;
    out[22] = this.y21.g;
    out[23] = this.y21.b;
    out[24] = this.y22.r;
    out[25] = this.y22.g;
    out[26] = this.y22.b;
  }

  /**
   * @override
   */
  clone(): SphericalHarmonics3 {
    const v = new SphericalHarmonics3();
    return this.cloneTo(v);
  }

  /**
   * @override
   */
  cloneTo(out: SphericalHarmonics3): SphericalHarmonics3 {
    this.y00.cloneTo(out.y00);
    this.y1_1.cloneTo(out.y1_1);
    this.y10.cloneTo(out.y10);
    this.y11.cloneTo(out.y11);
    this.y2_2.cloneTo(out.y2_2);
    this.y2_1.cloneTo(out.y2_1);
    this.y20.cloneTo(out.y20);
    this.y21.cloneTo(out.y21);
    this.y22.cloneTo(out.y22);
    return out;
  }
}
