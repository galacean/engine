import { BoundingBox, MathUtil, Matrix, Quaternion, Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { property } from "../../../clone/CloneManager";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  /** @internal */
  static _tempVector20 = new Vector2();
  /** @internal */
  static _tempVector21 = new Vector2();
  /** @internal */
  static _tempVector30 = new Vector3();
  /** @internal */
  static _tempVector31 = new Vector3();
  private static _tempQuaternion = new Quaternion();
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;

  protected _updateManager = new UpdateFlagManager();

  @property
  private _enabled = true;
  @property
  private _randomDirectionAmount = 0;

  @property
  private _position = new Vector3(0, 0, 0);
  @property
  private _rotation = new Vector3(0, 0, 0);
  @property
  private _scale = new Vector3(1, 1, 1);
  private _matrix = new Matrix();
  private _transformDirty = false;
  private _hasShapeTransform = false;

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
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    this._generateLocalPositionAndDirection(rand, emitTime, position, direction);
    if (this._hasShapeTransform) {
      const matrix = this._getMatrix();
      Vector3.transformToVec3(position, matrix, position);
      Vector3.transformNormal(direction, matrix, direction);
      direction.normalize();
    }
  }

  /**
   * @internal
   */
  _getPositionRange(bounds: BoundingBox): void {
    this._getLocalPositionRange(bounds.min, bounds.max);
    if (this._hasShapeTransform) {
      BoundingBox.transform(bounds, this._getMatrix(), bounds);
    }
  }

  /**
   * @internal
   */
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalDirectionRange(outMin, outMax);
    if (this._hasShapeTransform) {
      this._transformDirectionRange(outMin, outMax);
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

  protected _onTransformChanged = (): void => {
    this._transformDirty = true;
    const { _position: p, _rotation: r, _scale: s } = this;
    this._hasShapeTransform =
      p.x !== 0 || p.y !== 0 || p.z !== 0 || r.x !== 0 || r.y !== 0 || r.z !== 0 || s.x !== 1 || s.y !== 1 || s.z !== 1;
    this._updateManager.dispatch();
  };

  private _getMatrix(): Matrix {
    if (this._transformDirty) {
      const { _rotation: r } = this;
      const q = BaseShape._tempQuaternion;
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(r.x),
        MathUtil.degreeToRadian(r.y),
        MathUtil.degreeToRadian(r.z),
        q
      );
      Matrix.affineTransformation(this._scale, q, this._position, this._matrix);
      this._transformDirty = false;
    }
    return this._matrix;
  }

  // Arvo min/max method without translation, only apply RS part of the matrix
  private _transformDirectionRange(outMin: Vector3, outMax: Vector3): void {
    const e = this._getMatrix().elements;
    const { x: minX, y: minY, z: minZ } = outMin;
    const { x: maxX, y: maxY, z: maxZ } = outMax;
    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
      e4 = e[4], e5 = e[5], e6 = e[6],
      e8 = e[8], e9 = e[9], e10 = e[10];

    outMin.set(
      (e0 > 0 ? e0 * minX : e0 * maxX) + (e4 > 0 ? e4 * minY : e4 * maxY) + (e8 > 0 ? e8 * minZ : e8 * maxZ),
      (e1 > 0 ? e1 * minX : e1 * maxX) + (e5 > 0 ? e5 * minY : e5 * maxY) + (e9 > 0 ? e9 * minZ : e9 * maxZ),
      (e2 > 0 ? e2 * minX : e2 * maxX) + (e6 > 0 ? e6 * minY : e6 * maxY) + (e10 > 0 ? e10 * minZ : e10 * maxZ)
    );

    outMax.set(
      (e0 > 0 ? e0 * maxX : e0 * minX) + (e4 > 0 ? e4 * maxY : e4 * minY) + (e8 > 0 ? e8 * maxZ : e8 * minZ),
      (e1 > 0 ? e1 * maxX : e1 * minX) + (e5 > 0 ? e5 * maxY : e5 * minY) + (e9 > 0 ? e9 * maxZ : e9 * minZ),
      (e2 > 0 ? e2 * maxX : e2 * minX) + (e6 > 0 ? e6 * maxY : e6 * minY) + (e10 > 0 ? e10 * maxZ : e10 * minZ)
    );
  }
}
