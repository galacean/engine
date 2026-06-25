import { BoundingBox, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { Texture2D } from "../texture/Texture2D";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";

/**
 * A loaded 3D Gaussian Splatting scene: per-splat center, covariance and color baked into GPU data
 * textures, addressed by linear splat index. Assign it to a {@link GaussianSplatRenderer} via `splat`.
 */
export class GaussianSplat extends ReferResource {
  /** Bytes per splat in the decoded layout: position(3 float) + scale(3 float) + color(4 byte) + quaternion(4 byte). */
  private static readonly _rowLength = 3 * 4 + 3 * 4 + 4 + 4;

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

  constructor(engine: Engine) {
    super(engine);
  }

  /**
   * Decode a standard 32-byte-per-splat buffer (antimatter15 `.splat` layout, also the target of the PLY/SPZ
   * parsers) into the GPU data textures.
   * @param buffer - Raw splat buffer
   */
  setData(buffer: ArrayBuffer): void {
    const rowLength = GaussianSplat._rowLength;
    const uBuffer = new Uint8Array(buffer);
    const fBuffer = new Float32Array(buffer);
    const count = (this._splatCount = (uBuffer.length / rowLength) | 0);

    // Near-square layout keeps both dimensions <= ceil(sqrt(count)) (~1415 even for 2M splats), comfortably
    // inside the WebGL2 minimum MAX_TEXTURE_SIZE, so no capability query or width capping is needed.
    const width = (this._textureWidth = Math.ceil(Math.sqrt(count)));
    const height = (this._textureHeight = Math.ceil(count / width));
    const texelCount = width * height;

    const centers = new Float32Array(texelCount * 4);
    const covA = new Float32Array(texelCount * 4);
    const covB = new Float32Array(texelCount * 4);
    const colors = new Uint8Array(texelCount * 4);
    const positions = (this._positions = new Float32Array(count * 4));

    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < count; i++) {
      const f = i * 8;
      const u = i * rowLength;
      const x = fBuffer[f + 0];
      const y = fBuffer[f + 1];
      const z = fBuffer[f + 2];

      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      x < min.x && (min.x = x);
      y < min.y && (min.y = y);
      z < min.z && (min.z = z);
      x > max.x && (max.x = x);
      y > max.y && (max.y = y);
      z > max.z && (max.z = z);

      // Quaternion packed as (w, x, y, z) bytes; w is negated to match the trainer's handedness.
      let qx = (uBuffer[u + 29] - 127.5) / 127.5;
      let qy = (uBuffer[u + 30] - 127.5) / 127.5;
      let qz = (uBuffer[u + 31] - 127.5) / 127.5;
      let qw = -(uBuffer[u + 28] - 127.5) / 127.5;
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

      // Covariance Sigma = R * diag((2s)^2) * R^T. The 2x scale matches the projection's quad sizing.
      const sx = fBuffer[f + 3] * 2;
      const sy = fBuffer[f + 4] * 2;
      const sz = fBuffer[f + 5] * 2;
      const ax = sx * sx;
      const ay = sy * sy;
      const az = sz * sz;
      const s00 = r00 * r00 * ax + r01 * r01 * ay + r02 * r02 * az;
      const s01 = r00 * r10 * ax + r01 * r11 * ay + r02 * r12 * az;
      const s02 = r00 * r20 * ax + r01 * r21 * ay + r02 * r22 * az;
      const s11 = r10 * r10 * ax + r11 * r11 * ay + r12 * r12 * az;
      const s12 = r10 * r20 * ax + r11 * r21 * ay + r12 * r22 * az;
      const s22 = r20 * r20 * ax + r21 * r21 * ay + r22 * r22 * az;

      const o = i * 4;
      centers[o + 0] = x;
      centers[o + 1] = y;
      centers[o + 2] = z;
      centers[o + 3] = 1;
      covA[o + 0] = s00;
      covA[o + 1] = s01;
      covA[o + 2] = s02;
      covA[o + 3] = s11;
      covB[o + 0] = s12;
      covB[o + 1] = s22;
      colors[o + 0] = uBuffer[u + 24];
      colors[o + 1] = uBuffer[u + 25];
      colors[o + 2] = uBuffer[u + 26];
      colors[o + 3] = uBuffer[u + 27];
    }

    this._bounds.min.copyFrom(min);
    this._bounds.max.copyFrom(max);

    this._centerTexture = this._createDataTexture(width, height, TextureFormat.R32G32B32A32, centers);
    this._covATexture = this._createDataTexture(width, height, TextureFormat.R32G32B32A32, covA);
    this._covBTexture = this._createDataTexture(width, height, TextureFormat.R32G32B32A32, covB);
    this._colorTexture = this._createDataTexture(width, height, TextureFormat.R8G8B8A8, colors);
  }

  private _createDataTexture(
    width: number,
    height: number,
    format: TextureFormat,
    data: Float32Array | Uint8Array
  ): Texture2D {
    const texture = new Texture2D(this.engine, width, height, format, false, false);
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
    this._centerTexture = this._covATexture = this._covBTexture = this._colorTexture = null;
    this._positions = null;
  }
}
