import { Color, MathUtil, Matrix } from "@galacean/engine-math";
import { Component } from "../Component";
import { Layer } from "../Layer";
import { ignoreClone } from "../clone/CloneDecorators";
import { ShadowType } from "../shadow";

/**
 * Light base class.
 */
export abstract class Light extends Component {
  private static readonly _minNormalFloat32 = 2 ** -126;

  protected static _encodeDistance(value: number): number {
    if (!(value > 0)) return 1e-4;
    // Zero disables cutoff in shader, so keep finite radii within normal FP32 range
    return Number.isFinite(Math.fround(value)) ? Math.max(value, Light._minNormalFloat32) : 0;
  }

  /**
   * Culling mask - which layers the light affect.
   * @remarks Support bit manipulation, corresponding to `Layer`.
   */
  cullingMask = Layer.Everything;

  /** How this light casts shadows. */
  shadowType = ShadowType.None;
  /** Shadow bias.*/
  shadowBias = 1;
  /** Shadow mapping normal-based bias. */
  shadowNormalBias = 1;

  /**
   * @deprecated
   * Please use `shadowNearPlaneOffset` instead.
   */
  shadowNearPlane = 0.1;

  /** @internal */
  @ignoreClone
  _lightIndex = -1;

  private _shadowStrength = 1.0;
  private _color = new Color(1, 1, 1, 1);
  @ignoreClone
  private _viewMat: Matrix;
  @ignoreClone
  private _inverseViewMat: Matrix;

  /** Shadow intensity, the larger the value, the clearer and darker the shadow, range [0,1]. */
  get shadowStrength(): number {
    return this._shadowStrength;
  }

  set shadowStrength(value: number) {
    this._shadowStrength = MathUtil.clamp(value, 0, 1);
  }

  /**
   * Light Color.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
    }
  }

  /**
   * View matrix.
   */
  get viewMatrix(): Matrix {
    const viewMat = (this._viewMat ||= new Matrix());
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;
    if (transform._getWorldUniformScaling()) {
      const ae = worldMatrix.elements;
      const a11 = ae[0],
        a12 = ae[1],
        a13 = ae[2];
      const s2 = a11 * a11 + a12 * a12 + a13 * a13;
      if (s2) {
        const invS2 = 1.0 / s2;
        const a21 = ae[4],
          a22 = ae[5],
          a23 = ae[6];
        const a31 = ae[8],
          a32 = ae[9],
          a33 = ae[10];
        const tx = ae[12],
          ty = ae[13],
          tz = ae[14];
        const r11 = a11 * invS2,
          r12 = a21 * invS2,
          r13 = a31 * invS2;
        const r21 = a12 * invS2,
          r22 = a22 * invS2,
          r23 = a32 * invS2;
        const r31 = a13 * invS2,
          r32 = a23 * invS2,
          r33 = a33 * invS2;
        const oe = viewMat.elements;
        oe[0] = r11;
        oe[1] = r12;
        oe[2] = r13;
        oe[3] = 0;
        oe[4] = r21;
        oe[5] = r22;
        oe[6] = r23;
        oe[7] = 0;
        oe[8] = r31;
        oe[9] = r32;
        oe[10] = r33;
        oe[11] = 0;
        oe[12] = -(r11 * tx + r21 * ty + r31 * tz) + 0;
        oe[13] = -(r12 * tx + r22 * ty + r32 * tz) + 0;
        oe[14] = -(r13 * tx + r23 * ty + r33 * tz) + 0;
        oe[15] = 1;
      }
      return viewMat;
    }
    Matrix.invert(worldMatrix, viewMat);
    return viewMat;
  }

  /**
   * Inverse view matrix.
   */
  get inverseViewMatrix(): Matrix {
    const inverseViewMat = (this._inverseViewMat ||= new Matrix());
    inverseViewMat.copyFrom(this.entity.transform.worldMatrix);
    return inverseViewMat;
  }
}
