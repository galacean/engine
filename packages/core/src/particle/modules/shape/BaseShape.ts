import { MathUtil, Matrix, Quaternion, Rand, Vector3 } from "@galacean/engine-math";
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
  private _matrix = new Matrix();
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
      const matrix = this._getMatrix();
      Vector3.transformToVec3(position, matrix, position);
      Vector3.transformNormal(direction, matrix, direction);
      direction.normalize();
    }
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalPositionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      this._transformBoundingBox(outMin, outMax, true);
    }
  }

  /**
   * @internal
   */
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    this._getLocalDirectionRange(outMin, outMax);
    if (this._hasShapeTransform()) {
      this._transformBoundingBox(outMin, outMax, false);
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

  private _getMatrix(): Matrix {
    if (this._transformDirty) {
      const { _rotation: r, _rotationQuaternion: q } = this;
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

  private _hasShapeTransform(): boolean {
    const { _position: p, _rotation: r, _scale: s } = this;
    return (
      p.x !== 0 || p.y !== 0 || p.z !== 0 || r.x !== 0 || r.y !== 0 || r.z !== 0 || s.x !== 1 || s.y !== 1 || s.z !== 1
    );
  }

  /**
   * Arvo method: transform AABB by matrix
   */
  private _transformBoundingBox(outMin: Vector3, outMax: Vector3, includeTranslation: boolean): void {
    const e = this._getMatrix().elements;

    const minX = outMin.x,
      minY = outMin.y,
      minZ = outMin.z;
    const maxX = outMax.x,
      maxY = outMax.y,
      maxZ = outMax.z;

    const e0 = e[0],
      e1 = e[1],
      e2 = e[2];
    const e4 = e[4],
      e5 = e[5],
      e6 = e[6];
    const e8 = e[8],
      e9 = e[9],
      e10 = e[10];

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

    if (includeTranslation) {
      outMin.x += e[12];
      outMin.y += e[13];
      outMin.z += e[14];
      outMax.x += e[12];
      outMax.y += e[13];
      outMax.z += e[14];
    }
  }
}
