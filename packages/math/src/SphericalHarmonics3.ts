import { Color } from "./Color";
import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Vector3 } from "./Vector3";

/**
 * Use SH3 to represent irradiance environment maps efficiently, allowing for interactive rendering of diffuse objects under distant illumination.
 * @remarks
 * https://graphics.stanford.edu/papers/envmap/envmap.pdf
 * http://www.ppsloan.org/publications/StupidSH36.pdf
 * https://google.github.io/filament/Filament.md.html#annex/sphericalharmonics
 */
export class SphericalHarmonics3
  implements IClone<SphericalHarmonics3>, ICopy<SphericalHarmonics3, SphericalHarmonics3>
{
  /** The coefficients of SphericalHarmonics3. */
  coefficients: Float32Array = new Float32Array(27);

  /**
   * Add light to SphericalHarmonics3.
   * @param direction - Light direction
   * @param color - Light color
   * @param deltaSolidAngle - The delta solid angle of the light
   */
  addLight(direction: Vector3, color: Color, deltaSolidAngle: number): void {
    /**
     * Implements `EvalSHBasis` from [Projection from Cube maps] in http://www.ppsloan.org/publications/StupidSH36.pdf.
     *
     * Basis constants
     * 0: Math.sqrt(1/(4 * Math.PI))
     *
     * 1: -Math.sqrt(3 / (4 * Math.PI))
     * 2: Math.sqrt(3 / (4 * Math.PI))
     * 3: -Math.sqrt(3 / (4 * Math.PI))
     *
     * 4: Math.sqrt(15 / (4 * Math.PI))
     * 5: -Math.sqrt(15 / (4 * Math.PI))
     * 6: Math.sqrt(5 / (16 * Math.PI))
     * 7: -Math.sqrt(15 / (4 * Math.PI)）
     * 8: Math.sqrt(15 / (16 * Math.PI))
     */

    color.scale(deltaSolidAngle);

    const coe = this.coefficients;

    const { _x: x, _y: y, _z: z } = direction;
    const { r, g, b } = color;

    const bv0 = 0.282095; // basis0 = 0.886227
    const bv1 = -0.488603 * y; // basis1 = -0.488603
    const bv2 = 0.488603 * z; // basis2 = 0.488603
    const bv3 = -0.488603 * x; // basis3 = -0.488603
    const bv4 = 1.092548 * (x * y); // basis4 = 1.092548
    const bv5 = -1.092548 * (y * z); // basis5 = -1.092548
    const bv6 = 0.315392 * (3 * z * z - 1); // basis6 = 0.315392
    const bv7 = -1.092548 * (x * z); // basis7 = -1.092548
    const bv8 = 0.546274 * (x * x - y * y); // basis8 = 0.546274

    (coe[0] += r * bv0), (coe[1] += g * bv0), (coe[2] += b * bv0);

    (coe[3] += r * bv1), (coe[4] += g * bv1), (coe[5] += b * bv1);
    (coe[6] += r * bv2), (coe[7] += g * bv2), (coe[8] += b * bv2);
    (coe[9] += r * bv3), (coe[10] += g * bv3), (coe[11] += b * bv3);

    (coe[12] += r * bv4), (coe[13] += g * bv4), (coe[14] += b * bv4);
    (coe[15] += r * bv5), (coe[16] += g * bv5), (coe[17] += b * bv5);
    (coe[18] += r * bv6), (coe[19] += g * bv6), (coe[20] += b * bv6);
    (coe[21] += r * bv7), (coe[22] += g * bv7), (coe[23] += b * bv7);
    (coe[24] += r * bv8), (coe[25] += g * bv8), (coe[26] += b * bv8);
  }

  /**
   * Evaluates the color for the specified direction.
   * @param direction - Specified direction
   * @param out - Out color
   */
  evaluate(direction: Vector3, out: Color): Color {
    /**
     * Equations based on data from: http://ppsloan.org/publications/StupidSH36.pdf
     *
     *
     * Basis constants
     * 0: Math.sqrt(1/(4 * Math.PI))
     *
     * 1: -Math.sqrt(3 / (4 * Math.PI))
     * 2: Math.sqrt(3 / (4 * Math.PI))
     * 3: -Math.sqrt(3 / (4 * Math.PI))
     *
     * 4: Math.sqrt(15 / (4 * Math.PI)）
     * 5: -Math.sqrt(15 / (4 * Math.PI))
     * 6: Math.sqrt(5 / (16 * Math.PI)）
     * 7: -Math.sqrt(15 / (4 * Math.PI)）
     * 8: Math.sqrt(15 / (16 * Math.PI)）
     *
     *
     * Convolution kernel
     * 0: Math.PI
     * 1: (2 * Math.PI) / 3
     * 2: Math.PI / 4
     */

    const coe = this.coefficients;
    const { _x: x, _y: y, _z: z } = direction;

    const bv0 = 0.886227; // kernel0 * basis0 = 0.886227
    const bv1 = -1.023327 * y; // kernel1 * basis1 = -1.023327
    const bv2 = 1.023327 * z; // kernel1 * basis2 = 1.023327
    const bv3 = -1.023327 * x; // kernel1 * basis3 = -1.023327
    const bv4 = 0.858086 * y * x; // kernel2 * basis4 = 0.858086
    const bv5 = -0.858086 * y * z; // kernel2 * basis5 = -0.858086
    const bv6 = 0.247708 * (3 * z * z - 1); // kernel2 * basis6 = 0.247708
    const bv7 = -0.858086 * z * x; // kernel2 * basis7 = -0.858086
    const bv8 = 0.429042 * (x * x - y * y); // kernel2 * basis8 = 0.429042

    // l0
    let r = coe[0] * bv0;
    let g = coe[1] * bv0;
    let b = coe[2] * bv0;

    // l1
    r += coe[3] * bv1 + coe[6] * bv2 + coe[9] * bv3;
    g += coe[4] * bv1 + coe[7] * bv2 + coe[10] * bv3;
    b += coe[5] * bv1 + coe[8] * bv2 + coe[11] * bv3;

    // l2
    r += coe[12] * bv4 + coe[15] * bv5 + coe[18] * bv6 + coe[21] * bv7 + coe[24] * bv8;
    g += coe[13] * bv4 + coe[16] * bv5 + coe[19] * bv6 + coe[22] * bv7 + coe[25] * bv8;
    b += coe[14] * bv4 + coe[17] * bv5 + coe[20] * bv6 + coe[23] * bv7 + coe[26] * bv8;

    out.set(r, g, b, 1.0);
    return out;
  }

  /**
   * Scale the coefficients.
   * @param s - The amount by which to scale the SphericalHarmonics3
   */
  scale(s: number): void {
    const src = this.coefficients;

    (src[0] *= s), (src[1] *= s), (src[2] *= s);
    (src[3] *= s), (src[4] *= s), (src[5] *= s);
    (src[6] *= s), (src[7] *= s), (src[8] *= s);
    (src[9] *= s), (src[10] *= s), (src[11] *= s);
    (src[12] *= s), (src[13] *= s), (src[14] *= s);
    (src[15] *= s), (src[16] *= s), (src[17] *= s);
    (src[18] *= s), (src[19] *= s), (src[20] *= s);
    (src[21] *= s), (src[22] *= s), (src[23] *= s);
    (src[24] *= s), (src[25] *= s), (src[26] *= s);
  }

  /**
   * Creates a clone of this SphericalHarmonics3.
   * @returns A clone of this SphericalHarmonics3
   */
  clone(): SphericalHarmonics3 {
    const sh = new SphericalHarmonics3();
    sh.copyFrom(this);
    return sh;
  }

  /**
   * Copy this SphericalHarmonics3 from the specified SphericalHarmonics3.
   * @param source - The specified SphericalHarmonics3
   * @returns This SphericalHarmonics3
   */
  copyFrom(source: SphericalHarmonics3): SphericalHarmonics3 {
    source.copyToArray(this.coefficients);
    return this;
  }

  /**
   * Copy the value of this spherical harmonics from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): void {
    const s = this.coefficients;

    (s[0] = array[offset]), (s[1] = array[1 + offset]), (s[2] = array[2 + offset]);
    (s[3] = array[3 + offset]), (s[4] = array[4 + offset]), (s[5] = array[5 + offset]);
    (s[6] = array[6 + offset]), (s[7] = array[7 + offset]), (s[8] = array[8 + offset]);
    (s[9] = array[9 + offset]), (s[10] = array[10 + offset]), (s[11] = array[11 + offset]);
    (s[12] = array[12 + offset]), (s[13] = array[13 + offset]), (s[14] = array[14 + offset]);
    (s[15] = array[15 + offset]), (s[16] = array[16 + offset]), (s[17] = array[17 + offset]);
    (s[18] = array[18 + offset]), (s[19] = array[19 + offset]), (s[20] = array[20 + offset]);
    (s[21] = array[21 + offset]), (s[22] = array[22 + offset]), (s[23] = array[23 + offset]);
    (s[24] = array[24 + offset]), (s[25] = array[25 + offset]), (s[26] = array[26 + offset]);
  }

  /**
   * Copy the value of this spherical harmonics to an array.
   * @param out - The array
   * @param outOffset - The start offset of the array
   */
  copyToArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0): void {
    const s = this.coefficients;

    (out[0 + outOffset] = s[0]), (out[1 + outOffset] = s[1]), (out[2 + outOffset] = s[2]);

    (out[3 + outOffset] = s[3]), (out[4 + outOffset] = s[4]), (out[5 + outOffset] = s[5]);
    (out[6 + outOffset] = s[6]), (out[7 + outOffset] = s[7]), (out[8 + outOffset] = s[8]);
    (out[9 + outOffset] = s[9]), (out[10 + outOffset] = s[10]), (out[11 + outOffset] = s[11]);

    (out[12 + outOffset] = s[12]), (out[13 + outOffset] = s[13]), (out[14 + outOffset] = s[14]);
    (out[15 + outOffset] = s[15]), (out[16 + outOffset] = s[16]), (out[17 + outOffset] = s[17]);
    (out[18 + outOffset] = s[18]), (out[19 + outOffset] = s[19]), (out[20 + outOffset] = s[20]);
    (out[21 + outOffset] = s[21]), (out[22 + outOffset] = s[22]), (out[23 + outOffset] = s[23]);
    (out[24 + outOffset] = s[24]), (out[25 + outOffset] = s[25]), (out[26 + outOffset] = s[26]);
  }
}
