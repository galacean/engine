import { MathUtil, Matrix, Matrix3x3, Quaternion, Vector3 } from "@galacean/engine-math";
import { BoolUpdateFlag } from "./BoolUpdateFlag";
import { Component } from "./Component";
import { Entity } from "./Entity";
import { assignmentClone, deepClone, ignoreClone } from "./clone/CloneManager";
import { Logger } from "./base";

/**
 * Used to implement transformation related functions.
 */
export class Transform extends Component {
  private static _tempQuat0: Quaternion = new Quaternion();
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();
  private static _tempVec32: Vector3 = new Vector3();
  private static _tempMat30: Matrix3x3 = new Matrix3x3();
  private static _tempMat31: Matrix3x3 = new Matrix3x3();
  private static _tempMat32: Matrix3x3 = new Matrix3x3();
  private static _tempMat41: Matrix = new Matrix();
  private static _tempMat42: Matrix = new Matrix();

  @deepClone
  private _position: Vector3 = new Vector3();
  @deepClone
  private _rotation: Vector3 = new Vector3();
  @deepClone
  private _rotationQuaternion: Quaternion = new Quaternion();
  @deepClone
  private _scale: Vector3 = new Vector3(1, 1, 1);
  @assignmentClone
  private _localUniformScaling: boolean = true;
  @deepClone
  private _worldPosition: Vector3 = new Vector3();
  @deepClone
  private _worldRotation: Vector3 = new Vector3();
  @deepClone
  private _worldRotationQuaternion: Quaternion = new Quaternion();
  @assignmentClone
  private _worldUniformScaling: boolean = true;
  @deepClone
  private _lossyWorldScale: Vector3 = new Vector3(1, 1, 1);
  @deepClone
  private _localMatrix: Matrix = new Matrix();
  @deepClone
  private _worldMatrix: Matrix = new Matrix();
  @ignoreClone
  private _worldForward: Vector3 = null;
  @ignoreClone
  private _worldRight: Vector3 = null;
  @ignoreClone
  private _worldUp: Vector3 = null;

  @ignoreClone
  private _isParentDirty: boolean = true;
  @ignoreClone
  private _parentTransformCache: Transform = null;
  private _dirtyFlag: number = TransformModifyFlags.WmWpWeWqWs;

  /**
   * Local position.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (this._position !== value) {
      this._position.copyFrom(value);
    }
  }

  /**
   * World position.
   */
  get worldPosition(): Vector3 {
    const worldPosition = this._worldPosition;
    if (this._isContainDirtyFlag(TransformModifyFlags.WorldPosition)) {
      //@ts-ignore
      worldPosition._onValueChanged = null;
      if (this._getParentTransform()) {
        this.worldMatrix.getTranslation(worldPosition);
      } else {
        worldPosition.copyFrom(this._position);
      }
      //@ts-ignore
      worldPosition._onValueChanged = this._onWorldPositionChanged;
      this._setDirtyFlagFalse(TransformModifyFlags.WorldPosition);
    }

    return worldPosition;
  }

  set worldPosition(value: Vector3) {
    if (this._worldPosition !== value) {
      this._worldPosition.copyFrom(value);
    }
  }

  /**
   * Local rotation, defining the rotation value in degrees.
   * Rotations are performed around the Y axis, the X axis, and the Z axis, in that order.
   */
  get rotation(): Vector3 {
    const rotation = this._rotation;
    if (this._isContainDirtyFlag(TransformModifyFlags.LocalEuler)) {
      //@ts-ignore
      rotation._onValueChanged = null;
      this._rotationQuaternion.toEuler(rotation);
      rotation.scale(MathUtil.radToDegreeFactor); // radians to degrees
      //@ts-ignore
      rotation._onValueChanged = this._onRotationChanged;
      this._setDirtyFlagFalse(TransformModifyFlags.LocalEuler);
    }

    return rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation !== value) {
      this._rotation.copyFrom(value);
    }
  }

  /**
   * World rotation, defining the rotation value in degrees.
   * Rotations are performed around the Y axis, the X axis, and the Z axis, in that order.
   */
  get worldRotation(): Vector3 {
    const worldRotation = this._worldRotation;
    if (this._isContainDirtyFlag(TransformModifyFlags.WorldEuler)) {
      //@ts-ignore
      worldRotation._onValueChanged = null;
      this.worldRotationQuaternion.toEuler(worldRotation);
      worldRotation.scale(MathUtil.radToDegreeFactor); // Radian to angle
      //@ts-ignore
      worldRotation._onValueChanged = this._onWorldRotationChanged;
      this._setDirtyFlagFalse(TransformModifyFlags.WorldEuler);
    }
    return worldRotation;
  }

  set worldRotation(value: Vector3) {
    if (this._worldRotation !== value) {
      this._worldRotation.copyFrom(value);
    }
  }

  /**
   * Local rotation, defining the rotation by using a unit quaternion.
   */
  get rotationQuaternion(): Quaternion {
    const rotationQuaternion = this._rotationQuaternion;
    if (this._isContainDirtyFlag(TransformModifyFlags.LocalQuat)) {
      //@ts-ignore
      rotationQuaternion._onValueChanged = null;
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(this._rotation.x),
        MathUtil.degreeToRadian(this._rotation.y),
        MathUtil.degreeToRadian(this._rotation.z),
        rotationQuaternion
      );
      //@ts-ignore
      rotationQuaternion._onValueChanged = this._onRotationQuaternionChanged;
      this._setDirtyFlagFalse(TransformModifyFlags.LocalQuat);
    }
    return rotationQuaternion;
  }

  set rotationQuaternion(value: Quaternion) {
    if (this._rotationQuaternion !== value) {
      if (value.normalized) {
        this._rotationQuaternion.copyFrom(value);
      } else {
        Quaternion.normalize(value, this._rotationQuaternion);
      }
    } else {
      value.normalized || value.normalize();
    }
  }

  /**
   * World rotation, defining the rotation by using a unit quaternion.
   */
  get worldRotationQuaternion(): Quaternion {
    const worldRotationQuaternion = this._worldRotationQuaternion;
    if (this._isContainDirtyFlag(TransformModifyFlags.WorldQuat)) {
      //@ts-ignore
      worldRotationQuaternion._onValueChanged = null;
      const parent = this._getParentTransform();
      if (parent != null) {
        Quaternion.multiply(parent.worldRotationQuaternion, this.rotationQuaternion, worldRotationQuaternion);
      } else {
        worldRotationQuaternion.copyFrom(this.rotationQuaternion);
      }
      //@ts-ignore
      worldRotationQuaternion._onValueChanged = this._onWorldRotationQuaternionChanged;
      this._setDirtyFlagFalse(TransformModifyFlags.WorldQuat);
    }
    return worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: Quaternion) {
    if (this._worldRotationQuaternion !== value) {
      if (value.normalized) {
        this._worldRotationQuaternion.copyFrom(value);
      } else {
        Quaternion.normalize(value, this._worldRotationQuaternion);
      }
    }
    value.normalized || value.normalize();
  }

  /**
   * Local scaling.
   */
  get scale(): Vector3 {
    return this._scale;
  }

  set scale(value: Vector3) {
    if (this._scale !== value) {
      this._scale.copyFrom(value);
    }
  }

  /**
   * Local lossy scaling.
   * @remarks The value obtained may not be correct under certain conditions(for example, the parent node has non-uniform world scaling,
   * and the child node has a rotation), the scaling will be tilted.
   */
  get lossyWorldScale(): Vector3 {
    if (this._isContainDirtyFlag(TransformModifyFlags.WorldScale)) {
      if (this._getParentTransform()) {
        // Vector3 cannot be used to correctly represent the scaling. Must use Matrix3x3
        const scaleMat = this._getScaleMatrix();
        const e = scaleMat.elements;
        this._lossyWorldScale.set(e[0], e[4], e[8]);
      } else {
        this._lossyWorldScale.copyFrom(this._scale);
      }
      this._setDirtyFlagFalse(TransformModifyFlags.WorldScale);
    }
    return this._lossyWorldScale;
  }

  /**
   * Local matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get localMatrix(): Matrix {
    if (this._isContainDirtyFlag(TransformModifyFlags.LocalMatrix)) {
      Matrix.affineTransformation(this._scale, this.rotationQuaternion, this._position, this._localMatrix);
      this._setDirtyFlagFalse(TransformModifyFlags.LocalMatrix);
    }
    return this._localMatrix;
  }

  set localMatrix(value: Matrix) {
    if (this._localMatrix !== value) {
      this._localMatrix.copyFrom(value);
    }
    const { _position: position, _rotationQuaternion: rotationQuaternion, _scale: scale } = this;
    // @ts-ignore
    position._onValueChanged = rotationQuaternion._onValueChanged = scale._onValueChanged = null;
    this._localMatrix.decompose(position, rotationQuaternion, scale);
    // @ts-ignore
    position._onValueChanged = this._onPositionChanged;
    // @ts-ignore
    rotationQuaternion._onValueChanged = this._onRotationQuaternionChanged;
    // @ts-ignore
    scale._onValueChanged = this._onScaleChanged;

    this._setDirtyFlagTrue(TransformModifyFlags.LocalEuler);
    this._setDirtyFlagFalse(TransformModifyFlags.LocalMatrix | TransformModifyFlags.LocalQuat);
    const localUniformScaling = scale.x === scale.y && scale.y === scale.z;
    if (this._localUniformScaling !== localUniformScaling) {
      this._localUniformScaling = localUniformScaling;
      this._updateAllWorldFlag(TransformModifyFlags.WmWpWeWqWsWus);
    } else {
      this._updateAllWorldFlag(TransformModifyFlags.WmWpWeWqWs);
    }
  }

  /**
   * World matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldMatrix(): Matrix {
    if (this._isContainDirtyFlag(TransformModifyFlags.WorldMatrix)) {
      const parent = this._getParentTransform();
      if (parent) {
        Matrix.multiply(parent.worldMatrix, this.localMatrix, this._worldMatrix);
      } else {
        this._worldMatrix.copyFrom(this.localMatrix);
      }
      this._setDirtyFlagFalse(TransformModifyFlags.WorldMatrix);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: Matrix) {
    if (this._worldMatrix !== value) {
      this._worldMatrix.copyFrom(value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat42);
      Matrix.multiply(Transform._tempMat42, value, this._localMatrix);
    } else {
      this._localMatrix.copyFrom(value);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlagFalse(TransformModifyFlags.WorldMatrix);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);

    this._onPositionChanged = this._onPositionChanged.bind(this);
    this._onWorldPositionChanged = this._onWorldPositionChanged.bind(this);
    this._onRotationChanged = this._onRotationChanged.bind(this);
    this._onWorldRotationChanged = this._onWorldRotationChanged.bind(this);
    this._onRotationQuaternionChanged = this._onRotationQuaternionChanged.bind(this);
    this._onWorldRotationQuaternionChanged = this._onWorldRotationQuaternionChanged.bind(this);
    this._onScaleChanged = this._onScaleChanged.bind(this);

    //@ts-ignore
    this._position._onValueChanged = this._onPositionChanged;
    //@ts-ignore
    this._worldPosition._onValueChanged = this._onWorldPositionChanged;
    //@ts-ignore
    this._rotation._onValueChanged = this._onRotationChanged;
    //@ts-ignore
    this._worldRotation._onValueChanged = this._onWorldRotationChanged;
    //@ts-ignore
    this._rotationQuaternion._onValueChanged = this._onRotationQuaternionChanged;
    //@ts-ignore
    this._worldRotationQuaternion._onValueChanged = this._onWorldRotationQuaternionChanged;
    //@ts-ignore
    this._scale._onValueChanged = this._onScaleChanged;
  }

  /**
   * Set local position by X, Y, Z value.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setPosition(x: number, y: number, z: number): void {
    this._position.set(x, y, z);
  }

  /**
   * Set local rotation by the X, Y, Z components of the euler angle, unit in degrees.
   * Rotations are performed around the Y axis, the X axis, and the Z axis, in that order.
   * @param x - The angle of rotation around the X axis
   * @param y - The angle of rotation around the Y axis
   * @param z - The angle of rotation around the Z axis
   */
  setRotation(x: number, y: number, z: number): void {
    this._rotation.set(x, y, z);
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
  }

  /**
   * Set local scaling by scaling values along X, Y, Z axis.
   * @param x - Scaling along X axis
   * @param y - Scaling along Y axis
   * @param z - Scaling along Z axis
   */
  setScale(x: number, y: number, z: number): void {
    this._scale.set(x, y, z);
  }

  /**
   * Set world position by X, Y, Z value.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setWorldPosition(x: number, y: number, z: number): void {
    this._worldPosition.set(x, y, z);
  }

  /**
   * Set world rotation by the X, Y, Z components of the euler angle, unit in degrees, Yaw/Pitch/Roll sequence.
   * @param x - The angle of rotation around the X axis
   * @param y - The angle of rotation around the Y axis
   * @param z - The angle of rotation around the Z axis
   */
  setWorldRotation(x: number, y: number, z: number): void {
    this._worldRotation.set(x, y, z);
  }

  /**
   * Set local rotation by the X, Y, Z, and W components of the quaternion.
   * @param x - X component of quaternion
   * @param y - Y component of quaternion
   * @param z - Z component of quaternion
   * @param w - W component of quaternion
   */
  setWorldRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._worldRotationQuaternion.set(x, y, z, w);
  }

  /**
   * The forward direction in world space.
   */
  get worldForward(): Vector3 {
    const worldForward = (this._worldForward ||= new Vector3());
    const e = this.worldMatrix.elements;
    worldForward.set(-e[8], -e[9], -e[10]);
    return worldForward.normalize();
  }

  /**
   * The right direction in world space.
   */
  get worldRight(): Vector3 {
    const worldRight = (this._worldRight ||= new Vector3());
    const e = this.worldMatrix.elements;
    worldRight.set(e[0], e[1], e[2]);
    return worldRight.normalize();
  }

  /**
   * The up direction in world space.
   */
  get worldUp(): Vector3 {
    const worldUp = (this._worldUp ||= new Vector3());
    const e = this.worldMatrix.elements;
    worldUp.set(e[4], e[5], e[6]);
    return worldUp.normalize();
  }

  /**
   * Translate in the direction and distance of the translation.
   * @param translation - Direction and distance of translation
   * @param relativeToLocal = `true` - Is relative to the local coordinate system
   */
  translate(translation: Vector3, relativeToLocal?: boolean): void;

  /**
   * Translate some distance by x along the x axis, y along the y axis, and z along the z axis.
   * @param x - Distance along the x axis
   * @param y - Distance along the y axis
   * @param z - Distance along the z axis
   * @param relativeToLocal = `true` - Is relative to the local coordinate system
   */
  translate(x: number, y: number, z: number, relativeToLocal?: boolean): void;

  translate(
    translationOrX: Vector3 | number,
    relativeToLocalOrY?: boolean | number,
    z?: number,
    relativeToLocal?: boolean
  ): void {
    if (typeof translationOrX === "number") {
      const translate = Transform._tempVec30;
      translate.set(translationOrX, <number>relativeToLocalOrY, z);
      this._translate(translate, relativeToLocal);
    } else {
      this._translate(translationOrX, <boolean>relativeToLocalOrY);
    }
  }

  /**
   * Rotate around the passed Vector3.
   * @param rotation - Euler angle in degrees
   * @param relativeToLocal = `true` - Is relative to the local coordinate system
   */
  rotate(rotation: Vector3, relativeToLocal?: boolean): void;

  /**
   * Rotate around the passed Vector3.
   * @param x - Rotation along x axis, in degrees
   * @param y - Rotation along y axis, in degrees
   * @param z - Rotation along z axis, in degrees
   * @param relativeToLocal = `true` - Is relative to the local coordinate system
   */
  rotate(x: number, y: number, z: number, relativeToLocal?: boolean): void;

  rotate(
    rotationOrX: Vector3 | number,
    relativeToLocalOrY?: boolean | number,
    z?: number,
    relativeToLocal?: boolean
  ): void {
    if (typeof rotationOrX === "number") {
      this._rotateXYZ(rotationOrX, <number>relativeToLocalOrY, z, relativeToLocal);
    } else {
      this._rotateXYZ(rotationOrX.x, rotationOrX.y, rotationOrX.z, <boolean>relativeToLocalOrY);
    }
  }

  /**
   * Rotate around the specified axis according to the specified angle.
   * @param axis - Rotate axis
   * @param angle - Rotate angle in degrees
   * @param relativeToLocal = `true` - Relative to local space
   */
  rotateByAxis(axis: Vector3, angle: number, relativeToLocal: boolean = true): void {
    const rad = angle * MathUtil.degreeToRadFactor;
    Quaternion.rotationAxisAngle(axis, rad, Transform._tempQuat0);
    this._rotateByQuat(Transform._tempQuat0, relativeToLocal);
  }

  /**
   * Rotate and ensure that the world front vector points to the target world position.
   * @param targetPosition - Target world position
   * @param worldUp - Up direction in world space, default is Vector3(0, 1, 0)
   */
  lookAt(targetPosition: Vector3, worldUp?: Vector3): void {
    const zAxis = Transform._tempVec30;
    Vector3.subtract(this.worldPosition, targetPosition, zAxis);
    let axisLen = zAxis.length();
    if (axisLen <= MathUtil.zeroTolerance) {
      // The current position and the target position are almost the same.
      return;
    }
    zAxis.scale(1 / axisLen);
    const xAxis = Transform._tempVec31;
    if (worldUp) {
      Vector3.cross(worldUp, zAxis, xAxis);
    } else {
      xAxis.set(zAxis.z, 0, -zAxis.x);
    }
    axisLen = xAxis.length();
    if (axisLen <= MathUtil.zeroTolerance) {
      // @todo:
      // 1.worldUp is（0,0,0）
      // 2.worldUp is parallel to zAxis
      return;
    }
    xAxis.scale(1 / axisLen);
    const yAxis = Transform._tempVec32;
    Vector3.cross(zAxis, xAxis, yAxis);

    const rotMat = Transform._tempMat41;
    const { elements: e } = rotMat;
    (e[0] = xAxis.x), (e[1] = xAxis.y), (e[2] = xAxis.z);
    (e[4] = yAxis.x), (e[5] = yAxis.y), (e[6] = yAxis.z);
    (e[8] = zAxis.x), (e[9] = zAxis.y), (e[10] = zAxis.z);
    rotMat.getRotation(this._worldRotationQuaternion);
  }

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateAllWorldFlag(TransformModifyFlags.WmWpWeWqWsWus);
  }

  /**
   * @internal
   */
  _isFrontFaceInvert(): boolean {
    const scale = this.lossyWorldScale;
    let isInvert = scale.x < 0;
    scale.y < 0 && (isInvert = !isInvert);
    scale.z < 0 && (isInvert = !isInvert);
    return isInvert;
  }

  /**
   * @internal
   */
  _copyFrom(transform: Transform): void {
    this._position.copyFrom(transform.position);
    this._rotation.copyFrom(transform.rotation);
    this._scale.copyFrom(transform.scale);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    //@ts-ignore
    this._worldPosition._onValueChanged = null;
    //@ts-ignore
    this._rotation._onValueChanged = null;
    //@ts-ignore
    this._worldRotation._onValueChanged = null;
    //@ts-ignore
    this._rotationQuaternion._onValueChanged = null;
    //@ts-ignore
    this._worldRotationQuaternion._onValueChanged = null;
    //@ts-ignore
    this._position._onValueChanged = null;
    //@ts-ignore
    this._scale._onValueChanged = null;
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldPositionFlag(): void {
    if (!this._isContainDirtyFlags(TransformModifyFlags.WmWp)) {
      this._worldAssociatedChange(TransformModifyFlags.WmWp);
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateWorldPositionFlag();
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldRotationQuaternion: Will trigger the world rotation (in quaternion) update of itself and all parent entities.
   * Get worldRotation: Will trigger the world rotation(in euler and quaternion) update of itself and world rotation(in quaternion) update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldRotationFlag() {
    const parent = this._getParentTransform();
    const parentWorldUniformScaling = parent ? parent._getWorldUniformScaling() : true;
    let flags = parentWorldUniformScaling ? TransformModifyFlags.WmWeWq : TransformModifyFlags.WmWeWqWs;
    if (!this._isContainDirtyFlags(flags)) {
      this._worldAssociatedChange(flags);
      flags = this._getWorldUniformScaling() ? TransformModifyFlags.WmWpWeWq : TransformModifyFlags.WmWpWeWqWs;
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateWorldPositionAndRotationFlag(flags); // Rotation update of parent entity will trigger world position, rotation and scale update of all child entity.
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldRotationQuaternion: Will trigger the world rotation (in quaternion) update of itself and all parent entities.
   * Get worldRotation: Will trigger the world rotation(in euler and quaternion) update of itself and world rotation(in quaternion) update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   * @param flags - Dirty flag
   */
  private _updateWorldPositionAndRotationFlag(flags: TransformModifyFlags): void {
    if (!this._isContainDirtyFlags(flags)) {
      this._worldAssociatedChange(flags);
      flags = this._getWorldUniformScaling() ? TransformModifyFlags.WmWpWeWq : TransformModifyFlags.WmWpWeWqWs;
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateWorldPositionAndRotationFlag(flags);
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix) to be false.
   * @param flags - Dirty flag
   */
  private _updateWorldScaleFlag(flags: TransformModifyFlags): void {
    if (!this._isContainDirtyFlags(flags)) {
      this._worldAssociatedChange(flags);
      flags |= TransformModifyFlags.WorldPosition;
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateWorldPositionAndScaleFlag(flags);
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix) to be false.
   * @param flags - Dirty flag
   */
  private _updateWorldPositionAndScaleFlag(flags: TransformModifyFlags): void {
    if (!this._isContainDirtyFlags(flags)) {
      this._worldAssociatedChange(flags);
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateWorldPositionAndScaleFlag(flags);
      }
    }
  }

  /**
   * Update all world transform property dirty flag, the principle is the same as above.
   * @param flags - Dirty flag
   */
  private _updateAllWorldFlag(flags: TransformModifyFlags): void {
    if (!this._isContainDirtyFlags(flags)) {
      this._worldAssociatedChange(flags);
      const children = this._entity._children;
      for (let i = 0, n = children.length; i < n; i++) {
        children[i].transform?._updateAllWorldFlag(flags);
      }
    }
  }

  private _getParentTransform(): Transform | null {
    if (!this._isParentDirty) {
      return this._parentTransformCache;
    }
    let parentCache: Transform = null;
    let parent = this._entity.parent;
    while (parent) {
      const transform = parent.transform;
      if (transform) {
        parentCache = transform;
        break;
      } else {
        parent = parent.parent;
      }
    }
    this._parentTransformCache = parentCache;
    this._isParentDirty = false;
    return parentCache;
  }

  private _getScaleMatrix(): Matrix3x3 {
    const invRotation = Transform._tempQuat0;
    const invRotationMat = Transform._tempMat30;
    const worldRotScaMat = Transform._tempMat31;
    const scaMat = Transform._tempMat32;
    worldRotScaMat.copyFromMatrix(this.worldMatrix);
    Quaternion.invert(this.worldRotationQuaternion, invRotation);
    Matrix3x3.rotationQuaternion(invRotation, invRotationMat);
    Matrix3x3.multiply(invRotationMat, worldRotScaMat, scaMat);
    return scaMat;
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
    this._entity._updateFlagManager.dispatch(type);
  }

  private _rotateByQuat(rotateQuat: Quaternion, relativeToLocal: boolean): void {
    if (relativeToLocal) {
      Quaternion.multiply(this.rotationQuaternion, rotateQuat, this._rotationQuaternion);
    } else {
      Quaternion.multiply(rotateQuat, this.worldRotationQuaternion, this._worldRotationQuaternion);
    }
  }

  private _translate(translation: Vector3, relativeToLocal: boolean = true): void {
    if (relativeToLocal) {
      const { _tempVec30 } = Transform;
      Vector3.transformByQuat(translation, this.worldRotationQuaternion, _tempVec30);
      this.worldPosition.add(_tempVec30);
    } else {
      this.worldPosition.add(translation);
    }
  }

  private _rotateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    const radFactor = MathUtil.degreeToRadFactor;
    const rotQuat = Transform._tempQuat0;
    Quaternion.rotationEuler(x * radFactor, y * radFactor, z * radFactor, rotQuat);
    this._rotateByQuat(rotQuat, relativeToLocal);
  }

  @ignoreClone
  private _onPositionChanged(): void {
    this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix);
    this._updateWorldPositionFlag();
  }

  @ignoreClone
  private _onWorldPositionChanged(): void {
    const worldPosition = this._worldPosition;
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat41);
      Vector3.transformCoordinate(worldPosition, Transform._tempMat41, this._position);
    } else {
      this._position.copyFrom(worldPosition);
    }
    this._setDirtyFlagFalse(TransformModifyFlags.WorldPosition);
  }

  @ignoreClone
  private _onRotationChanged(): void {
    this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix | TransformModifyFlags.LocalQuat);
    this._setDirtyFlagFalse(TransformModifyFlags.LocalEuler);
    this._updateWorldRotationFlag();
  }

  @ignoreClone
  private _onWorldRotationChanged(): void {
    const worldRotation = this._worldRotation;
    Quaternion.rotationEuler(
      MathUtil.degreeToRadian(worldRotation.x),
      MathUtil.degreeToRadian(worldRotation.y),
      MathUtil.degreeToRadian(worldRotation.z),
      this._worldRotationQuaternion
    );
    this._setDirtyFlagFalse(TransformModifyFlags.WorldEuler);
  }

  @ignoreClone
  private _onRotationQuaternionChanged(): void {
    this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix | TransformModifyFlags.LocalEuler);
    this._setDirtyFlagFalse(TransformModifyFlags.LocalQuat);
    this._updateWorldRotationFlag();
  }

  @ignoreClone
  private _onWorldRotationQuaternionChanged(): void {
    const worldRotationQuaternion = this._worldRotationQuaternion;
    const parent = this._getParentTransform();
    if (parent) {
      const invParentQuaternion = Transform._tempQuat0;
      Quaternion.invert(parent.worldRotationQuaternion, invParentQuaternion);
      Quaternion.multiply(invParentQuaternion, worldRotationQuaternion, this._rotationQuaternion);
    } else {
      this._rotationQuaternion.copyFrom(worldRotationQuaternion);
    }
    this._setDirtyFlagFalse(TransformModifyFlags.WorldQuat);
  }

  @ignoreClone
  private _onScaleChanged(): void {
    const { x, y, z } = this._scale;
    this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix);
    const localUniformScaling = x == y && y == z;
    if (this._localUniformScaling !== localUniformScaling) {
      this._localUniformScaling = localUniformScaling;
      this._updateWorldScaleFlag(TransformModifyFlags.WmWsWus);
    } else {
      this._updateWorldScaleFlag(TransformModifyFlags.WmWs);
    }
  }

  private _getWorldUniformScaling(): boolean {
    if (this._isContainDirtyFlag(TransformModifyFlags.IsWorldUniformScaling)) {
      const localUniformScaling = this._localUniformScaling;
      if (localUniformScaling) {
        const parent = this._getParentTransform();
        this._worldUniformScaling = localUniformScaling && (parent ? parent._getWorldUniformScaling() : true);
      } else {
        this._worldUniformScaling = false;
      }
      this._setDirtyFlagFalse(TransformModifyFlags.IsWorldUniformScaling);
    }
    return this._worldUniformScaling;
  }

  //--------------------------------------------------------------deprecated----------------------------------------------------------------
  /**
   * @deprecated
   * Listen for changes in the world pose of this `Entity`.
   * @returns Change flag
   */
  registerWorldChangeFlag(): BoolUpdateFlag {
    return this.entity._updateFlagManager.createFlag(BoolUpdateFlag);
  }
}

/**
 * @internal
 */
export enum TransformModifyFlags {
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  WorldEuler = 0x8,
  WorldQuat = 0x10,
  WorldScale = 0x20,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,

  /** This is an internal flag used to assist in determining the dispatch
   *  of world scaling dirty flags in the case of non-uniform scaling.
   */
  IsWorldUniformScaling = 0x100,

  /** WorldMatrix | WorldPosition */
  WmWp = 0x84,
  /** WorldMatrix | WorldEuler | WorldQuat */
  WmWeWq = 0x98,
  /** WorldMatrix | WorldEuler | WorldQuat | WorldScale*/
  WmWeWqWs = 0xb8,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat */
  WmWpWeWq = 0x9c,
  /** WorldMatrix | WorldScale */
  WmWs = 0xa0,
  /** WorldMatrix | WorldScale | WorldUniformScaling */
  WmWsWus = 0x1a0,
  /** WorldMatrix | WorldPosition | WorldScale */
  WmWpWs = 0xa4,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale */
  WmWpWeWqWs = 0xbc,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale | WorldUniformScaling */
  WmWpWeWqWsWus = 0x1bc
}
