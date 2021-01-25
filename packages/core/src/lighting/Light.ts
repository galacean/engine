import { Matrix } from "@oasis-engine/math";
import { Component } from "../Component";
import { LightFeature } from "./LightFeature";

/**
 * Light base class.
 */
export class Light extends Component {
  /**
   * Each type of light source is at most 10, beyond which it will not take effect.
   * */
  protected static _maxLight: number = 10;

  private _viewMat: Matrix;
  private _inverseViewMat: Matrix;

  /**
   * Mount to the current Scene.
   * @internal
   * @override
   */
  _onEnable() {
    this.scene.findFeature(LightFeature).attachRenderLight(this);
  }

  /**
   * Unmount from the current Scene.
   * @internal
   * @override
   */
  _onDisable() {
    this.scene.findFeature(LightFeature).detachRenderLight(this);
  }

  /**
   * View matrix.
   * @readonly
   */
  get viewMatrix() {
    if (!this._viewMat) this._viewMat = new Matrix();
    Matrix.invert(this.entity.transform.worldMatrix, this._viewMat);
    return this._viewMat;
  }

  /**
   * Inverse view matrix.
   * @readonly
   */
  get inverseViewMatrix() {
    if (!this._inverseViewMat) this._inverseViewMat = new Matrix();
    Matrix.invert(this.viewMatrix, this._inverseViewMat);
    return this._inverseViewMat;
  }
}
