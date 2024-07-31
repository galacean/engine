import { MathUtil, Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { LiteCollider } from "./LiteCollider";
import { LiteUpdateFlag } from "./LiteUpdateFlag";
import { LiteUpdateFlagManager } from "./LiteUpdateFlagManager";
import { LiteColliderShape } from "./shape/LiteColliderShape";

/**
 * Used to implement transformation related functions.
 */
export class LiteTransform {
  private static _tempQuat0: Quaternion = new Quaternion();
  private static _tempMat42: Matrix = new Matrix();

  private _position: Vector3 = new Vector3();
  private _rotation: Vector3 = new Vector3();
  private _rotationQuaternion: Quaternion = new Quaternion();
  private _scale: Vector3 = new Vector3(1, 1, 1);
  private _worldRotationQuaternion: Quaternion = new Quaternion();
  private _localMatrix: Matrix = new Matrix();
  private _worldMatrix: Matrix = new Matrix();
  private _updateFlagManager: LiteUpdateFlagManager = new LiteUpdateFlagManager();
  private _isParentDirty: boolean = true;
  private _parentTransformCache: LiteTransform = null;
  private _dirtyFlag: number = TransformFlag.WmWpWeWqWs;

  private _owner: LiteColliderShape | LiteCollider;

  set owner(value: LiteColliderShape | LiteCollider) {
    this._owner = value;
  }

  /**
   * Local position.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (this._position !== value) {
      this._position.copyFrom(value);
    }
    this._setDirtyFlagTrue(TransformFlag.LocalMatrix);
    this._updateWorldPositionFlag();
  }

  /**
   * Local rotation, defining the rotation by using a unit quaternion.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get rotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(TransformFlag.LocalQuat)) {
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(this._rotation.x),
        MathUtil.degreeToRadian(this._rotation.y),
        MathUtil.degreeToRadian(this._rotation.z),
        this._rotationQuaternion
      );
      this._setDirtyFlagFalse(TransformFlag.LocalQuat);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: Quaternion) {
    if (this._rotationQuaternion !== value) {
      this._rotationQuaternion.copyFrom(value);
    }
    this._setDirtyFlagTrue(TransformFlag.LocalMatrix | TransformFlag.LocalEuler);
    this._setDirtyFlagFalse(TransformFlag.LocalQuat);
    this._updateWorldRotationFlag();
  }

  /**
   * World rotation, defining the rotation by using a unit quaternion.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldRotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(TransformFlag.WorldQuat)) {
      const parent = this._getParentTransform();
      if (parent != null) {
        Quaternion.multiply(parent.worldRotationQuaternion, this.rotationQuaternion, this._worldRotationQuaternion);
      } else {
        this._worldRotationQuaternion.copyFrom(this.rotationQuaternion);
      }
      this._setDirtyFlagFalse(TransformFlag.WorldQuat);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: Quaternion) {
    if (this._worldRotationQuaternion !== value) {
      this._worldRotationQuaternion.copyFrom(value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Quaternion.invert(parent.worldRotationQuaternion, LiteTransform._tempQuat0);
      Quaternion.multiply(value, LiteTransform._tempQuat0, this._rotationQuaternion);
    } else {
      this._rotationQuaternion.copyFrom(value);
    }
    this.rotationQuaternion = this._rotationQuaternion;
    this._setDirtyFlagFalse(TransformFlag.WorldQuat);
  }

  /**
   * Local scaling.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get scale(): Vector3 {
    return this._scale;
  }

  set scale(value: Vector3) {
    if (this._scale !== value) {
      this._scale.copyFrom(value);
    }
    this._setDirtyFlagTrue(TransformFlag.LocalMatrix);
    this._updateWorldScaleFlag();
  }

  /**
   * Local matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get localMatrix(): Matrix {
    if (this._isContainDirtyFlag(TransformFlag.LocalMatrix)) {
      Matrix.affineTransformation(this._scale, this.rotationQuaternion, this._position, this._localMatrix);
      this._setDirtyFlagFalse(TransformFlag.LocalMatrix);
    }
    return this._localMatrix;
  }

  set localMatrix(value: Matrix) {
    if (this._localMatrix !== value) {
      this._localMatrix.copyFrom(value);
    }
    this._localMatrix.decompose(this._position, this._rotationQuaternion, this._scale);
    this._setDirtyFlagTrue(TransformFlag.LocalEuler);
    this._setDirtyFlagFalse(TransformFlag.LocalMatrix);
    this._updateAllWorldFlag();
  }

  /**
   * World matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldMatrix(): Matrix {
    if (this._isContainDirtyFlag(TransformFlag.WorldMatrix)) {
      const parent = this._getParentTransform();
      if (parent) {
        Matrix.multiply(parent.worldMatrix, this.localMatrix, this._worldMatrix);
      } else {
        this._worldMatrix.copyFrom(this.localMatrix);
      }
      this._setDirtyFlagFalse(TransformFlag.WorldMatrix);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: Matrix) {
    if (this._worldMatrix !== value) {
      this._worldMatrix.copyFrom(value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, LiteTransform._tempMat42);
      Matrix.multiply(LiteTransform._tempMat42, value, this._localMatrix);
    } else {
      this._localMatrix.copyFrom(value);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlagFalse(TransformFlag.WorldMatrix);
  }

  /**
   * Set local position by X, Y, Z value.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setPosition(x: number, y: number, z: number): void {
    this._position.set(x, y, z);
    this.position = this._position;
  }

  /**
   * Set local rotation by the X, Y, Z, and W components of the quaternion.
   * @param x - X component of quaternion
   * @param y - Y component of quaternion
   * @param z - Z component of quaternion
   * @param w - W component of quaternion
   */
  setRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._rotationQuaternion.set(x, y, z, w);
    this.rotationQuaternion = this._rotationQuaternion;
  }

  /**
   * Set local scaling by scaling values along X, Y, Z axis.
   * @param x - Scaling along X axis
   * @param y - Scaling along Y axis
   * @param z - Scaling along Z axis
   */
  setScale(x: number, y: number, z: number): void {
    this._scale.set(x, y, z);
    this.scale = this._scale;
  }

  /**
   * Register world transform change flag.
   * @returns Change flag
   */
  registerWorldChangeFlag(): LiteUpdateFlag {
    return this._updateFlagManager.register();
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldPositionFlag(): void {
    if (!this._isContainDirtyFlags(TransformFlag.WmWp)) {
      this._worldAssociatedChange(TransformFlag.WmWp);
      if (this._owner instanceof LiteCollider) {
        const shapes = this._owner._shapes;
        for (let i: number = 0, n: number = shapes.length; i < n; i++) {
          shapes[i]._transform._updateWorldPositionFlag();
        }
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldRotationQuaternion: Will trigger the world rotation (in quaternion) update of itself and all parent entities.
   * Get worldRotation: Will trigger the world rotation(in euler and quaternion) update of itself and world rotation(in quaternion) update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldRotationFlag() {
    if (!this._isContainDirtyFlags(TransformFlag.WmWeWq)) {
      this._worldAssociatedChange(TransformFlag.WmWeWq);
      if (this._owner instanceof LiteCollider) {
        const shapes = this._owner._shapes;
        for (let i: number = 0, n: number = shapes.length; i < n; i++) {
          shapes[i]._transform._updateWorldRotationFlag();
        }
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix) to be false.
   */
  private _updateWorldScaleFlag() {
    if (!this._isContainDirtyFlags(TransformFlag.WmWs)) {
      this._worldAssociatedChange(TransformFlag.WmWs);
      if (this._owner instanceof LiteCollider) {
        const shapes = this._owner._shapes;
        for (let i: number = 0, n: number = shapes.length; i < n; i++) {
          shapes[i]._transform._updateWorldScaleFlag();
        }
      }
    }
  }

  /**
   * Update all world transform property dirty flag, the principle is the same as above.
   */
  private _updateAllWorldFlag(): void {
    if (!this._isContainDirtyFlags(TransformFlag.WmWpWeWqWs)) {
      this._worldAssociatedChange(TransformFlag.WmWpWeWqWs);
      if (this._owner instanceof LiteCollider) {
        const shapes = this._owner._shapes;
        for (let i: number = 0, n: number = shapes.length; i < n; i++) {
          shapes[i]._transform._updateAllWorldFlag();
        }
      }
    }
  }

  private _getParentTransform(): LiteTransform | null {
    if (!this._isParentDirty) {
      return this._parentTransformCache;
    }
    let parentCache: LiteTransform = null;
    if (this._owner instanceof LiteColliderShape) {
      let parent = this._owner._collider;
      parentCache = parent._transform;
    }

    this._parentTransformCache = parentCache;
    this._isParentDirty = false;
    return parentCache;
  }

  private _isContainDirtyFlags(targetDirtyFlags: number): boolean {
    return (this._dirtyFlag & targetDirtyFlags) === targetDirtyFlags;
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number) {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number) {
    this._dirtyFlag &= ~type;
  }

  private _worldAssociatedChange(type: number): void {
    this._dirtyFlag |= type;
    this._updateFlagManager.distribute();
  }
}

/**
 * Dirty flag of transform.
 */
enum TransformFlag {
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  WorldEuler = 0x8,
  WorldQuat = 0x10,
  WorldScale = 0x20,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,

  /** WorldMatrix | WorldPosition */
  WmWp = 0x84,
  /** WorldMatrix | WorldEuler | WorldQuat */
  WmWeWq = 0x98,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat */
  WmWpWeWq = 0x9c,
  /** WorldMatrix | WorldScale */
  WmWs = 0xa0,
  /** WorldMatrix | WorldPosition | WorldScale */
  WmWpWs = 0xa4,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale */
  WmWpWeWqWs = 0xbc
}
