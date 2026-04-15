import { MathUtil, Quaternion, Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { deepClone, ignoreClone } from "../../../clone/CloneManager";

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

  @deepClone
  private _position = new Vector3(0, 0, 0);
  @deepClone
  private _rotation = new Vector3(0, 0, 0);
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

  constructor() {
    // @ts-ignore
    this._position._onValueChanged = this._updateManager.dispatch.bind(this._updateManager);
    // @ts-ignore
    this._rotation._onValueChanged = this._onRotationChanged.bind(this);
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
    // @ts-ignore
    target._position._onValueChanged = target._updateManager.dispatch.bind(target._updateManager);
    // @ts-ignore
    target._rotation._onValueChanged = target._onRotationChanged.bind(target);
    target._rotationDirty = true;
  }

  /**
   * @internal
   */
  abstract _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void;

  /**
   * @internal
   */
  abstract _getDirectionRange(outMin: Vector3, outMax: Vector3): void;

  /**
   * @internal
   */
  abstract _getPositionRange(outMin: Vector3, outMax: Vector3): void;

  /**
   * @internal
   */
  _generateTransformedPositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    this._generatePositionAndDirection(rand, emitTime, position, direction);
    if (this._hasShapeTransform()) {
      const quaternion = this._getRotationQuaternion();
      Vector3.transformByQuat(position, quaternion, position);
      Vector3.transformByQuat(direction, quaternion, direction);
      position.add(this._position);
    }
  }

  /**
   * @internal
   */
  _getTransformedPositionRange(outMin: Vector3, outMax: Vector3): void {
    this._getPositionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      this._rotateBoundingBox(outMin, outMax);
      outMin.add(this._position);
      outMax.add(this._position);
    }
  }

  /**
   * @internal
   */
  _getTransformedDirectionRange(outMin: Vector3, outMax: Vector3): void {
    this._getDirectionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      this._rotateBoundingBox(outMin, outMax);
    }
  }

  protected _onRotationChanged(): void {
    this._rotationDirty = true;
    this._updateManager.dispatch();
  }

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
    const { _position: p, _rotation: r } = this;
    return p.x !== 0 || p.y !== 0 || p.z !== 0 || r.x !== 0 || r.y !== 0 || r.z !== 0;
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
