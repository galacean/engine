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

  private _coefficients: Float32Array = new Float32Array(27);

  /**
   * Convert radiance to irradiance with the A_l which is convoluted by the cosine lobe and pre-scale the basis function.
   * @remarks
   * Reference equation [4,5,6,7,8,9] from https://graphics.stanford.edu/papers/envmap/envmap.pdf
   *
   * @param out - The array
   * @returns Pre-scaled array
   */
  convertRadianceToIrradiance(out: Float32Array): Float32Array {
    const kernel = SphericalHarmonics3._convolutionKernel;
    const basis = SphericalHarmonics3._basisFunction;
    const src = this._coefficients;

    /**
     * 1.  L -> E
     * 2.  E * basis
     */

    // l0
    out[0] = src[0] * kernel[0] * basis[0];
    out[1] = src[1] * kernel[0] * basis[0];
    out[2] = src[2] * kernel[0] * basis[0];

    // l1
    out[3] = src[3] * kernel[1] * basis[1];
    out[4] = src[4] * kernel[1] * basis[1];
    out[5] = src[5] * kernel[1] * basis[1];
    out[6] = src[6] * kernel[1] * basis[2];
    out[7] = src[7] * kernel[1] * basis[2];
    out[8] = src[8] * kernel[1] * basis[2];
    out[9] = src[9] * kernel[1] * basis[3];
    out[10] = src[10] * kernel[1] * basis[3];
    out[11] = src[11] * kernel[1] * basis[3];

    // l2
    out[12] = src[12] * kernel[2] * basis[4];
    out[13] = src[13] * kernel[2] * basis[4];
    out[14] = src[14] * kernel[2] * basis[4];
    out[15] = src[15] * kernel[2] * basis[5];
    out[16] = src[16] * kernel[2] * basis[5];
    out[17] = src[17] * kernel[2] * basis[5];
    out[18] = src[18] * kernel[2] * basis[6];
    out[19] = src[19] * kernel[2] * basis[6];
    out[20] = src[20] * kernel[2] * basis[6];
    out[21] = src[21] * kernel[2] * basis[7];
    out[22] = src[22] * kernel[2] * basis[7];
    out[23] = src[23] * kernel[2] * basis[7];
    out[24] = src[24] * kernel[2] * basis[8];
    out[25] = src[25] * kernel[2] * basis[8];
    out[26] = src[26] * kernel[2] * basis[8];

    return out;
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
    const src = this._coefficients;
    const { x, y, z } = direction;
    const xy = x * y;
    const yz = y * z;
    const z3 = 3 * z * z - 1;
    const xz = x * z;
    const x2y2 = x * x - y * y;

    color.scale(solidAngle);

    src[0] += color.r * basis[0];
    src[1] += color.g * basis[0];
    src[2] += color.b * basis[0];

    src[3] += color.r * basis[1] * y;
    src[4] += color.g * basis[1] * y;
    src[5] += color.b * basis[1] * y;
    src[6] += color.r * basis[2] * z;
    src[7] += color.g * basis[2] * z;
    src[8] += color.b * basis[2] * z;
    src[9] += color.r * basis[3] * x;
    src[10] += color.g * basis[3] * x;
    src[11] += color.b * basis[3] * x;

    src[12] += color.r * basis[4] * xy;
    src[13] += color.g * basis[4] * xy;
    src[14] += color.b * basis[4] * xy;
    src[15] += color.r * basis[5] * yz;
    src[16] += color.g * basis[5] * yz;
    src[17] += color.b * basis[5] * yz;
    src[18] += color.r * basis[6] * z3;
    src[19] += color.g * basis[6] * z3;
    src[20] += color.b * basis[6] * z3;
    src[21] += color.r * basis[7] * xz;
    src[22] += color.g * basis[7] * xz;
    src[23] += color.b * basis[7] * xz;
    src[24] += color.r * basis[8] * x2y2;
    src[25] += color.g * basis[8] * x2y2;
    src[26] += color.b * basis[8] * x2y2;
  }

  /**
   * Scale the coefficients.
   */
  scale(value: number): void {
    const src = this._coefficients;

    src[0] *= value;
    src[1] *= value;
    src[2] *= value;
    src[3] *= value;
    src[4] *= value;
    src[5] *= value;
    src[6] *= value;
    src[7] *= value;
    src[8] *= value;
    src[9] *= value;
    src[10] *= value;
    src[11] *= value;
    src[12] *= value;
    src[13] *= value;
    src[14] *= value;
    src[15] *= value;
    src[16] *= value;
    src[17] *= value;
    src[18] *= value;
    src[19] *= value;
    src[20] *= value;
    src[21] *= value;
    src[22] *= value;
    src[23] *= value;
    src[24] *= value;
    src[25] *= value;
    src[26] *= value;
  }

  /**
   * Set the value of this spherical harmonics by an array.
   * @param array - The array
   * @param offset - The start offset of the array
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): void {
    const src = this._coefficients;

    src[0] = array[0 + offset];
    src[1] = array[1 + offset];
    src[2] = array[2 + offset];
    src[3] = array[3 + offset];
    src[4] = array[4 + offset];
    src[5] = array[5 + offset];
    src[6] = array[6 + offset];
    src[7] = array[7 + offset];
    src[8] = array[8 + offset];
    src[9] = array[9 + offset];
    src[10] = array[10 + offset];
    src[11] = array[11 + offset];
    src[12] = array[12 + offset];
    src[13] = array[13 + offset];
    src[14] = array[14 + offset];
    src[15] = array[15 + offset];
    src[16] = array[16 + offset];
    src[17] = array[17 + offset];
    src[18] = array[18 + offset];
    src[19] = array[19 + offset];
    src[20] = array[20 + offset];
    src[21] = array[21 + offset];
    src[22] = array[22 + offset];
    src[23] = array[23 + offset];
    src[24] = array[24 + offset];
    src[25] = array[25 + offset];
    src[26] = array[26 + offset];
  }

  /**
   * Clone the value of this spherical harmonics to an array.
   * @param out - The array
   * @param outOffset - The start offset of the array
   */
  toArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0): void {
    const src = this._coefficients;

    out[0 + outOffset] = src[0];
    out[1 + outOffset] = src[1];
    out[2 + outOffset] = src[2];

    out[3 + outOffset] = src[3];
    out[4 + outOffset] = src[4];
    out[5 + outOffset] = src[5];
    out[6 + outOffset] = src[6];
    out[7 + outOffset] = src[7];
    out[8 + outOffset] = src[8];
    out[9 + outOffset] = src[9];
    out[10 + outOffset] = src[10];
    out[11 + outOffset] = src[11];

    out[12 + outOffset] = src[12];
    out[13 + outOffset] = src[13];
    out[14 + outOffset] = src[14];
    out[15 + outOffset] = src[15];
    out[16 + outOffset] = src[16];
    out[17 + outOffset] = src[17];
    out[18 + outOffset] = src[18];
    out[19 + outOffset] = src[19];
    out[20 + outOffset] = src[20];
    out[21 + outOffset] = src[21];
    out[22 + outOffset] = src[22];
    out[23 + outOffset] = src[23];
    out[24 + outOffset] = src[24];
    out[25 + outOffset] = src[25];
    out[26 + outOffset] = src[26];
  }

  /**
   * @override
   */
  clone(): SphericalHarmonics3 {
    const v = new SphericalHarmonics3();
    this.cloneTo(v);

    return v;
  }

  /**
   * @override
   */
  cloneTo(out: SphericalHarmonics3): void {
    this.toArray(out._coefficients);
  }
}
