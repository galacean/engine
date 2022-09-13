import { Color, Matrix } from "@oasis-engine/math";
import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";

/**
 * Light base class.
 */
export abstract class Light extends Component {
  /**
   * Each type of light source is at most 10, beyond which it will not take effect.
   * */
  protected static _maxLight: number = 10;

  /** Light Color */
  color: Color = new Color(1, 1, 1, 1);
  /** Light Intensity */
  intensity: number = 1;

  /** whether enable shadow */
  enableShadow: boolean = false;
  /** Shadow bias.*/
  shadowBias: number = 1;
  /** Shadow mapping normal-based bias. */
  shadowNormalBias: number = 0;
  /** Near plane value to use for shadow frustums. */
  shadowNearPlane: number = 0.1;
  /** Shadow intensity, the larger the value, the clearer and darker the shadow. */
  shadowStrength: number = 1.0;

  /** @internal */
  @ignoreClone
  _lightIndex: number = -1;

  private _viewMat: Matrix;
  private _inverseViewMat: Matrix;

  /**
   * View matrix.
   */
  get viewMatrix(): Matrix {
    if (!this._viewMat) this._viewMat = new Matrix();
    Matrix.invert(this.entity.transform.worldMatrix, this._viewMat);
    return this._viewMat;
  }

  /**
   * Inverse view matrix.
   */
  get inverseViewMatrix(): Matrix {
    if (!this._inverseViewMat) this._inverseViewMat = new Matrix();
    Matrix.invert(this.viewMatrix, this._inverseViewMat);
    return this._inverseViewMat;
  }

  /**
   * @internal
   */
  abstract get _shadowProjectionMatrix(): Matrix;
}
