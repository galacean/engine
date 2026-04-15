import { MathUtil, Quaternion, Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { ignoreClone } from "../../../clone/CloneManager";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;

  private static _tempBasisX = new Vector3();
  private static _tempBasisY = new Vector3();
  private static _tempBasisZ = new Vector3();

  @ignoreClone
  protected _updateManager = new UpdateFlagManager();

  private _enabled = true;
  private _randomDirectionAmount = 0;

  @ignoreClone
  private _position = new Vector3(0, 0, 0);
  @ignoreClone
  private _rotation = new Vector3(0, 0, 0);
  @ignoreClone
  private _scale = new Vector3(1, 1, 1);
  @ignoreClone
  private _rotationQuaternion = new Quaternion();
  @ignoreClone
  private _rotationDirty = false;

  /**
   * Specifies whether the ShapeModule is enabled or disabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * Randomizes the starting direction of particles.
   */
  get randomDirectionAmount(): number {
    return this._randomDirectionAmount;
  }

  set randomDirectionAmount(value: number) {
    if (value !== this._randomDirectionAmount) {
      this._randomDirectionAmount = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * Apply a local position offset to the shape.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (value !== this._position) {
      this._position.copyFrom(value);
    }
  }

  /**
   * Apply a local rotation to the shape, specified as euler angles in degrees.
   */
  get rotation(): Vector3 {
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (value !== this._rotation) {
      this._rotation.copyFrom(value);
    }
  }

  /**
   * Apply a local scale to the shape.
   */
  get scale(): Vector3 {
    return this._scale;
  }

  set scale(value: Vector3) {
    if (value !== this._scale) {
      this._scale.copyFrom(value);
    }
  }

  constructor() {
    // @ts-ignore
    this._position._onValueChanged = this._onTransformChanged;
    // @ts-ignore
    this._rotation._onValueChanged = this._onRotationChanged;
    // @ts-ignore
    this._scale._onValueChanged = this._onTransformChanged;
  }

  /**
   * @internal
   */
  _registerOnValueChanged(listener: () => void): void {
    this._updateManager.addListener(listener);
  }

  /**
   * @internal
   */
  _unRegisterOnValueChanged(listener: () => void): void {
    this._updateManager.removeListener(listener);
  }

  /**
   * @internal
   */
  _cloneTo(target: BaseShape): void {
    const { _position: position, _rotation: rotation, _scale: scale } = target;

    // @ts-ignore
    position._onValueChanged = rotation._onValueChanged = scale._onValueChanged = null;

    position.copyFrom(this._position);
    rotation.copyFrom(this._rotation);
    scale.copyFrom(this._scale);

    // @ts-ignore
    position._onValueChanged = target._onTransformChanged;
    // @ts-ignore
    rotation._onValueChanged = target._onRotationChanged;
    // @ts-ignore
    scale._onValueChanged = target._onTransformChanged;
    target._rotationDirty = true;
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    this._generateLocalPositionAndDirection(rand, emitTime, position, direction);
    if (this._hasShapeTransform()) {
      const { _scale: scale } = this;
      position.multiply(scale);
      direction.multiply(scale);
      const quaternion = this._getRotationQuaternion();
      Vector3.transformByQuat(position, quaternion, position);
      Vector3.transformByQuat(direction, quaternion, direction);
      direction.normalize();
      position.add(this._position);
    }
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalPositionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      const { _scale: scale } = this;
      outMin.multiply(scale);
      outMax.multiply(scale);
      this._reorderMinMax(outMin, outMax);
      this._rotateBoundingBox(outMin, outMax);
      outMin.add(this._position);
      outMax.add(this._position);
    }
  }

  /**
   * @internal
   */
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalDirectionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      const { _scale: scale } = this;
      outMin.multiply(scale);
      outMax.multiply(scale);
      this._reorderMinMax(outMin, outMax);
      this._rotateBoundingBox(outMin, outMax);
    }
  }

  protected abstract _generateLocalPositionAndDirection(
    rand: Rand,
    emitTime: number,
    position: Vector3,
    direction: Vector3
  ): void;

  protected abstract _getLocalPositionRange(outMin: Vector3, outMax: Vector3): void;

  protected abstract _getLocalDirectionRange(outMin: Vector3, outMax: Vector3): void;

  @ignoreClone
  protected _onTransformChanged = (): void => {
    this._updateManager.dispatch();
  };

  @ignoreClone
  protected _onRotationChanged = (): void => {
    this._rotationDirty = true;
    this._updateManager.dispatch();
  };

  private _getRotationQuaternion(): Quaternion {
    if (this._rotationDirty) {
      const { x, y, z } = this._rotation;
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(x),
        MathUtil.degreeToRadian(y),
        MathUtil.degreeToRadian(z),
        this._rotationQuaternion
      );
      this._rotationDirty = false;
    }
    return this._rotationQuaternion;
  }

  private _hasShapeTransform(): boolean {
    const { _position: p, _rotation: r, _scale: s } = this;
    return (
      p.x !== 0 || p.y !== 0 || p.z !== 0 || r.x !== 0 || r.y !== 0 || r.z !== 0 || s.x !== 1 || s.y !== 1 || s.z !== 1
    );
  }

  private _reorderMinMax(min: Vector3, max: Vector3): void {
    let tmp: number;
    if (min.x > max.x) {
      tmp = min.x;
      min.x = max.x;
      max.x = tmp;
    }
    if (min.y > max.y) {
      tmp = min.y;
      min.y = max.y;
      max.y = tmp;
    }
    if (min.z > max.z) {
      tmp = min.z;
      min.z = max.z;
      max.z = tmp;
    }
  }

  private _rotateBoundingBox(outMin: Vector3, outMax: Vector3): void {
    const quaternion = this._getRotationQuaternion();

    const right = BaseShape._tempBasisX;
    const up = BaseShape._tempBasisY;
    const forward = BaseShape._tempBasisZ;

    right.set(1, 0, 0);
    Vector3.transformByQuat(right, quaternion, right);
    up.set(0, 1, 0);
    Vector3.transformByQuat(up, quaternion, up);
    forward.set(0, 0, 1);
    Vector3.transformByQuat(forward, quaternion, forward);

    const minX = outMin.x,
      minY = outMin.y,
      minZ = outMin.z;
    const maxX = outMax.x,
      maxY = outMax.y,
      maxZ = outMax.z;

    const xa = right.x,
      xb = up.x,
      xc = forward.x;
    const ya = right.y,
      yb = up.y,
      yc = forward.y;
    const za = right.z,
      zb = up.z,
      zc = forward.z;

    outMin.set(
      (xa > 0 ? xa * minX : xa * maxX) + (xb > 0 ? xb * minY : xb * maxY) + (xc > 0 ? xc * minZ : xc * maxZ),
      (ya > 0 ? ya * minX : ya * maxX) + (yb > 0 ? yb * minY : yb * maxY) + (yc > 0 ? yc * minZ : yc * maxZ),
      (za > 0 ? za * minX : za * maxX) + (zb > 0 ? zb * minY : zb * maxY) + (zc > 0 ? zc * minZ : zc * maxZ)
    );

    outMax.set(
      (xa > 0 ? xa * maxX : xa * minX) + (xb > 0 ? xb * maxY : xb * minY) + (xc > 0 ? xc * maxZ : xc * minZ),
      (ya > 0 ? ya * maxX : ya * minX) + (yb > 0 ? yb * maxY : yb * minY) + (yc > 0 ? yc * maxZ : yc * minZ),
      (za > 0 ? za * maxX : za * minX) + (zb > 0 ? zb * maxY : zb * minY) + (zc > 0 ? zc * maxZ : zc * minZ)
    );
  }
}
