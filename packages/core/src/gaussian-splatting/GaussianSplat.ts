import { BoundingBox, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { Texture2D } from "../texture/Texture2D";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";

const _halfF32 = new Float32Array(1);
const _halfI32 = new Int32Array(_halfF32.buffer);

/** Encode a float32 as a float16 (half) bit pattern, for upload into an R16G16B16A16 texture. */
function toHalf(value: number): number {
  _halfF32[0] = value;
  const x = _halfI32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

const SH_C0 = 0.28209479177387814;

/** Decoded gaussian splat attributes — the common output every loader format normalizes to. */
export interface GaussianSplatData {
  count: number;
  /** Spherical-harmonic degree present in `sh` (0 = none, DC color only). */
  shDegree: number;
  /** xyz world position, stride 3. */
  positions: Float32Array;
  /** xyz linear scale, stride 3. */
  scales: Float32Array;
  /** xyzw trainer-space quaternion, stride 4 (w is negated when building the rotation). */
  rotations: Float32Array;
  /** opacity in [0, 1], stride 1. */
  opacities: Float32Array;
  /** rgb DC spherical-harmonic coefficient, stride 3. */
  colors: Float32Array;
  /** higher-degree SH coefficients, coefficient-major per splat; empty when shDegree is 0. */
  sh: Float32Array;
}

/**
 * A loaded 3D Gaussian Splatting scene: per-splat center, covariance and color baked into GPU data
 * textures, addressed by linear splat index. Assign it to a {@link GaussianSplatRenderer} via `splat`.
 */
export class GaussianSplat extends ReferResource {
  private _splatCount = 0;
  private _textureWidth = 0;
  private _textureHeight = 0;
  private _bounds = new BoundingBox();

  /** View-space-depth source for the per-frame sorter (stride 4: x, y, z, 1). */
  private _positions: Float32Array = null;
  private _centerTexture: Texture2D = null;
  private _covATexture: Texture2D = null;
  private _covBTexture: Texture2D = null;
  private _colorTexture: Texture2D = null;
  private _shTexture: Texture2D = null;
  private _shDegree = 0;
  private _shTextureWidth = 0;
  private _shTextureHeight = 0;
  private _shTexelsPerSplat = 0;

  /** Number of gaussians. */
  get splatCount(): number {
    return this._splatCount;
  }

  /** Local-space bounds enclosing all gaussian centers. */
  get bounds(): BoundingBox {
    return this._bounds;
  }

  get textureWidth(): number {
    return this._textureWidth;
  }

  get textureHeight(): number {
    return this._textureHeight;
  }

  get positions(): Float32Array {
    return this._positions;
  }

  /** RGBA32F: gaussian center xyz + 1. */
  get centerTexture(): Texture2D {
    return this._centerTexture;
  }

  /** RGBA32F: 3D covariance (Sigma00, Sigma01, Sigma02, Sigma11). */
  get covATexture(): Texture2D {
    return this._covATexture;
  }

  /** RGBA32F: 3D covariance (Sigma12, Sigma22, 0, 0). */
  get covBTexture(): Texture2D {
    return this._covBTexture;
  }

  /** RGBA8: diffuse color + opacity. */
  get colorTexture(): Texture2D {
    return this._colorTexture;
  }

  /** RGBA16F: higher-order spherical-harmonic coefficients, tightly packed; null when shDegree is 0. */
  get shTexture(): Texture2D {
    return this._shTexture;
  }

  /** Spherical-harmonic degree (0-3); 0 means DC-only color. */
  get shDegree(): number {
    return this._shDegree;
  }

  /** Width of the SH texture, for addressing a splat's coefficient block in the shader. */
  get shTextureWidth(): number {
    return this._shTextureWidth;
  }

  /** Height of the SH texture. */
  get shTextureHeight(): number {
    return this._shTextureHeight;
  }

  /** RGBA16F texels occupied by one splat's SH coefficients. */
  get shTexelsPerSplat(): number {
    return this._shTexelsPerSplat;
  }

  constructor(engine: Engine) {
    super(engine);
  }

  /** Build the GPU data textures from decoded splat attributes. */
  setData(data: GaussianSplatData): void {
    const { positions: srcPositions, scales, rotations, opacities, colors: srcColors } = data;
    const count = (this._splatCount = data.count);

    // Near-square layout keeps both dimensions <= ceil(sqrt(count)) (~1415 even for 2M splats), comfortably
    // inside the WebGL2 minimum MAX_TEXTURE_SIZE, so no capability query or width capping is needed.
    const width = (this._textureWidth = Math.ceil(Math.sqrt(count)));
    const height = (this._textureHeight = Math.ceil(count / width));
    const texelCount = width * height;

    const centers = new Float32Array(texelCount * 4);
    const covA = new Uint16Array(texelCount * 4);
    const covB = new Uint16Array(texelCount * 4);
    const colors = new Uint8ClampedArray(texelCount * 4);
    const positions = (this._positions = new Float32Array(count * 4));

    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < count; i++) {
      const x = srcPositions[i * 3 + 0];
      const y = srcPositions[i * 3 + 1];
      const z = srcPositions[i * 3 + 2];

      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      x < min.x && (min.x = x);
      y < min.y && (min.y = y);
      z < min.z && (min.z = z);
      x > max.x && (max.x = x);
      y > max.y && (max.y = y);
      z > max.z && (max.z = z);

      // Quaternion is trainer-space (x, y, z, w); w is negated to match the trainer's handedness.
      let qx = rotations[i * 4 + 0];
      let qy = rotations[i * 4 + 1];
      let qz = rotations[i * 4 + 2];
      let qw = -rotations[i * 4 + 3];
      const ql = Math.hypot(qx, qy, qz, qw) || 1;
      qx /= ql;
      qy /= ql;
      qz /= ql;
      qw /= ql;

      // 3x3 rotation from the quaternion.
      const r00 = 1 - 2 * (qy * qy + qz * qz);
      const r01 = 2 * (qx * qy - qw * qz);
      const r02 = 2 * (qx * qz + qw * qy);
      const r10 = 2 * (qx * qy + qw * qz);
      const r11 = 1 - 2 * (qx * qx + qz * qz);
      const r12 = 2 * (qy * qz - qw * qx);
      const r20 = 2 * (qx * qz - qw * qy);
      const r21 = 2 * (qy * qz + qw * qx);
      const r22 = 1 - 2 * (qx * qx + qy * qy);

      // Covariance Sigma = R^T * diag((2s)^2) * R. R is built from the w-negated (conjugated) quaternion above,
      // so R^T is the splat's actual orientation; the textbook R*D*R^T applies the inverse rotation and shears
      // rotated splats into spikes. The 2x scale matches the projection's quad sizing.
      const sx = scales[i * 3 + 0] * 2;
      const sy = scales[i * 3 + 1] * 2;
      const sz = scales[i * 3 + 2] * 2;
      const ax = sx * sx;
      const ay = sy * sy;
      const az = sz * sz;
      const s00 = r00 * r00 * ax + r10 * r10 * ay + r20 * r20 * az;
      const s01 = r00 * r01 * ax + r10 * r11 * ay + r20 * r21 * az;
      const s02 = r00 * r02 * ax + r10 * r12 * ay + r20 * r22 * az;
      const s11 = r01 * r01 * ax + r11 * r11 * ay + r21 * r21 * az;
      const s12 = r01 * r02 * ax + r11 * r12 * ay + r21 * r22 * az;
      const s22 = r02 * r02 * ax + r12 * r12 * ay + r22 * r22 * az;

      // Normalize the covariance by its largest magnitude so it survives half-float precision; the shader
      // restores it from center.w.
      const factor =
        Math.max(Math.abs(s00), Math.abs(s01), Math.abs(s02), Math.abs(s11), Math.abs(s12), Math.abs(s22)) || 1;
      const inv = 1 / factor;
      const o = i * 4;
      centers[o + 0] = x;
      centers[o + 1] = y;
      centers[o + 2] = z;
      centers[o + 3] = factor;
      covA[o + 0] = toHalf(s00 * inv);
      covA[o + 1] = toHalf(s01 * inv);
      covA[o + 2] = toHalf(s02 * inv);
      covA[o + 3] = toHalf(s11 * inv);
      covB[o + 0] = toHalf(s12 * inv);
      covB[o + 1] = toHalf(s22 * inv);
      // DC spherical-harmonic coefficient -> sRGB base color; opacity is already 0..1.
      colors[o + 0] = (0.5 + SH_C0 * srcColors[i * 3 + 0]) * 255;
      colors[o + 1] = (0.5 + SH_C0 * srcColors[i * 3 + 1]) * 255;
      colors[o + 2] = (0.5 + SH_C0 * srcColors[i * 3 + 2]) * 255;
      colors[o + 3] = opacities[i] * 255;
    }

    this._bounds.min.copyFrom(min);
    this._bounds.max.copyFrom(max);

    // Center/covariance are raw data — must stay linear. Color is sRGB; tagging it lets the GPU linearize on
    // read, so blending is correct. Reading sRGB color as linear over-brightens it and makes the soft tails of
    // near-edge-on splats read as bright streaks instead of fading out.
    this._centerTexture = this._createDataTexture(width, height, TextureFormat.R32G32B32A32, centers);
    this._covATexture = this._createDataTexture(width, height, TextureFormat.R16G16B16A16, covA);
    this._covBTexture = this._createDataTexture(width, height, TextureFormat.R16G16B16A16, covB);
    this._colorTexture = this._createDataTexture(
      width,
      height,
      TextureFormat.R8G8B8A8,
      new Uint8Array(colors.buffer),
      true
    );

    // Spherical-harmonic coefficients incl. the DC term (coefficient 0), tightly packed into RGBA16F, one
    // texel-aligned block per splat. The DC is kept here too so the shader can rebuild the full 3DGS color from
    // raw coefficients and run it through the same sRGB path as the DC-only color (the color texture is already
    // sRGB-encoded, so adding the linear higher-order terms there would mismatch color spaces).
    this._shDegree = data.shDegree;
    if (data.shDegree > 0) {
      // One RGBA16F texel per coefficient (RGB used) so the shader reads `sh[k]` with a single fetch. DC is
      // coefficient 0; the rest follow in coefficient-major order.
      const texelsPerSplat = (data.shDegree + 1) * (data.shDegree + 1); // coefficients incl. DC
      const restCoeffs = texelsPerSplat - 1;
      const totalTexels = count * texelsPerSplat;
      const shWidth = Math.ceil(Math.sqrt(totalTexels));
      const shHeight = Math.ceil(totalTexels / shWidth);
      const shData = new Uint16Array(shWidth * shHeight * 4);
      const colors = data.colors;
      const sh = data.sh;
      for (let i = 0; i < count; i++) {
        let dst = i * texelsPerSplat * 4;
        shData[dst + 0] = toHalf(colors[i * 3 + 0]);
        shData[dst + 1] = toHalf(colors[i * 3 + 1]);
        shData[dst + 2] = toHalf(colors[i * 3 + 2]);
        const src = i * restCoeffs * 3;
        for (let k = 0; k < restCoeffs; k++) {
          dst += 4;
          shData[dst + 0] = toHalf(sh[src + k * 3 + 0]);
          shData[dst + 1] = toHalf(sh[src + k * 3 + 1]);
          shData[dst + 2] = toHalf(sh[src + k * 3 + 2]);
        }
      }
      this._shTexture = this._createDataTexture(shWidth, shHeight, TextureFormat.R16G16B16A16, shData);
      this._shTextureWidth = shWidth;
      this._shTextureHeight = shHeight;
      this._shTexelsPerSplat = texelsPerSplat;
    }
  }

  private _createDataTexture(
    width: number,
    height: number,
    format: TextureFormat,
    data: Float32Array | Uint16Array | Uint8Array,
    isSRGBColorSpace = false
  ): Texture2D {
    const texture = new Texture2D(this.engine, width, height, format, false, isSRGBColorSpace);
    texture.filterMode = TextureFilterMode.Point;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.setPixelBuffer(data);
    return texture;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._centerTexture?.destroy();
    this._covATexture?.destroy();
    this._covBTexture?.destroy();
    this._colorTexture?.destroy();
    this._shTexture?.destroy();
    this._centerTexture = this._covATexture = this._covBTexture = this._colorTexture = this._shTexture = null;
    this._positions = null;
  }
}
