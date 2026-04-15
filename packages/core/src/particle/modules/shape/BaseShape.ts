import { MathUtil, Matrix3x3, Quaternion, Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { ignoreClone } from "../../../clone/CloneManager";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;

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
  private _rsMatrix = new Matrix3x3();
  @ignoreClone
  private _transformDirty = false;

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
    this._rotation._onValueChanged = this._onTransformChanged;
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
    rotation._onValueChanged = target._onTransformChanged;
    // @ts-ignore
    scale._onValueChanged = target._onTransformChanged;
    target._transformDirty = true;
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    this._generateLocalPositionAndDirection(rand, emitTime, position, direction);
    if (this._hasShapeTransform()) {
      const e = this._getRSMatrix().elements;
      const { x: px, y: py, z: pz } = position;
      position.set(
        e[0] * px + e[3] * py + e[6] * pz,
        e[1] * px + e[4] * py + e[7] * pz,
        e[2] * px + e[5] * py + e[8] * pz
      );
      const { x: dx, y: dy, z: dz } = direction;
      direction
        .set(e[0] * dx + e[3] * dy + e[6] * dz, e[1] * dx + e[4] * dy + e[7] * dz, e[2] * dx + e[5] * dy + e[8] * dz)
        .normalize();
      position.add(this._position);
    }
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalPositionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      this._transformBoundingBox(outMin, outMax);
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
      this._transformBoundingBox(outMin, outMax);
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
    this._transformDirty = true;
    this._updateManager.dispatch();
  };

  private _getRSMatrix(): Matrix3x3 {
    if (this._transformDirty) {
      const { _rotation: r, _scale: s, _rotationQuaternion: q, _rsMatrix: rs } = this;
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(r.x),
        MathUtil.degreeToRadian(r.y),
        MathUtil.degreeToRadian(r.z),
        q
      );
      Matrix3x3.rotationQuaternion(q, rs);
      // Multiply each column by scale: col0 *= sx, col1 *= sy, col2 *= sz
      const e = rs.elements;
      e[0] *= s.x;
      e[1] *= s.x;
      e[2] *= s.x;
      e[3] *= s.y;
      e[4] *= s.y;
      e[5] *= s.y;
      e[6] *= s.z;
      e[7] *= s.z;
      e[8] *= s.z;
      this._transformDirty = false;
    }
    return this._rsMatrix;
  }

  private _hasShapeTransform(): boolean {
    const { _position: p, _rotation: r, _scale: s } = this;
    return (
      p.x !== 0 || p.y !== 0 || p.z !== 0 || r.x !== 0 || r.y !== 0 || r.z !== 0 || s.x !== 1 || s.y !== 1 || s.z !== 1
    );
  }

  /**
   * Arvo method: transform AABB by RS matrix
   */
  private _transformBoundingBox(outMin: Vector3, outMax: Vector3): void {
    const e = this._getRSMatrix().elements;

    const minX = outMin.x,
      minY = outMin.y,
      minZ = outMin.z;
    const maxX = outMax.x,
      maxY = outMax.y,
      maxZ = outMax.z;

    const e0 = e[0],
      e1 = e[1],
      e2 = e[2];
    const e3 = e[3],
      e4 = e[4],
      e5 = e[5];
    const e6 = e[6],
      e7 = e[7],
      e8 = e[8];

    outMin.set(
      (e0 > 0 ? e0 * minX : e0 * maxX) + (e3 > 0 ? e3 * minY : e3 * maxY) + (e6 > 0 ? e6 * minZ : e6 * maxZ),
      (e1 > 0 ? e1 * minX : e1 * maxX) + (e4 > 0 ? e4 * minY : e4 * maxY) + (e7 > 0 ? e7 * minZ : e7 * maxZ),
      (e2 > 0 ? e2 * minX : e2 * maxX) + (e5 > 0 ? e5 * minY : e5 * maxY) + (e8 > 0 ? e8 * minZ : e8 * maxZ)
    );

    outMax.set(
      (e0 > 0 ? e0 * maxX : e0 * minX) + (e3 > 0 ? e3 * maxY : e3 * minY) + (e6 > 0 ? e6 * maxZ : e6 * minZ),
      (e1 > 0 ? e1 * maxX : e1 * minX) + (e4 > 0 ? e4 * maxY : e4 * minY) + (e7 > 0 ? e7 * maxZ : e7 * minZ),
      (e2 > 0 ? e2 * maxX : e2 * minX) + (e5 > 0 ? e5 * maxY : e5 * minY) + (e8 > 0 ? e8 * maxZ : e8 * minZ)
    );
  }
}
