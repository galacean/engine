import { Vector3, Quaternion, Matrix4x4x4, Vector4, Matrix3x3x3, MathUtil } from "@alipay/o3-math";
import { Entity } from "./Entity";
import { Component } from "./Component";
import { UpdateFlag } from "./UpdateFlag";

/**
 * 用于实现变换相关功能。
 */
export class Transform extends Component {
  private static _tempVec3: Vector3 = new Vector3();
  private static _tempVec41: Vector4 = new Vector4();
  private static _tempVec40: Vector4 = new Vector4();
  private static _tempMat30: Matrix3x3 = mat3.create();
  private static _tempMat31: Matrix3x3 = mat3.create();
  private static _tempMat32: Matrix3x3 = mat3.create();
  private static _tempMat40: Matrix4x4 = mat4.create();
  private static _tempMat41: Matrix4x4 = mat4.create();
  private static _tempMat42: Matrix4x4 = mat4.create();
  private static _tempMat43: Matrix4x4 = mat4.create();

  private static _LOCAL_EULER_FLAG: number = 0x1;
  private static _LOCAL_QUAT_FLAG: number = 0x2;
  private static _WORLD_POSITION_FLAG: number = 0x4;
  private static _WORLD_EULER_FLAG: number = 0x8;
  private static _WORLD_QUAT_FLAG: number = 0x10;
  private static _WORLD_SCALE_FLAG: number = 0x20;
  private static _LOCAL_MATRIX_FLAG: number = 0x40;
  private static _WORLD_MATRIX_FLAG: number = 0x80;

  /**
   * _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG
   */
  private static _WM_WP_FLAGS: number = Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG;

  /**
   * _WORLD_MATRIX_FLAG | _WORLD_EULER_FLAG | _WORLD_QUAT_FLAG
   */
  private static _WM_WE_WQ_FLAGS: number =
    Transform._WORLD_MATRIX_FLAG | Transform._WORLD_EULER_FLAG | Transform._WORLD_QUAT_FLAG;

  /**
   * _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG | _WORLD_EULER_FLAG ｜ _WORLD_QUAT_FLAG
   */
  private static _WM_WP_WE_WQ_FLAGS: number =
    Transform._WORLD_MATRIX_FLAG |
    Transform._WORLD_POSITION_FLAG |
    Transform._WORLD_EULER_FLAG |
    Transform._WORLD_QUAT_FLAG;

  /**
   * Transform._WORLD_MATRIX_FLAG | Transform._WORLD_SCALE_FLAG
   */
  private static _WM_WS_FLAGS: number = Transform._WORLD_MATRIX_FLAG | Transform._WORLD_SCALE_FLAG;

  /**
   * Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_SCALE_FLAG
   */
  private static _WM_WP_WS_FLAGS: number =
    Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_SCALE_FLAG;

  /**
   * Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_EULER_FLAG | Transform._WORLD_QUAT_FLAG | Transform._WORLD_SCALE_FLAG
   */
  private static _WM_WP_WE_WQ_WS_FLAGS: number =
    Transform._WORLD_MATRIX_FLAG |
    Transform._WORLD_POSITION_FLAG |
    Transform._WORLD_EULER_FLAG |
    Transform._WORLD_QUAT_FLAG |
    Transform._WORLD_SCALE_FLAG;

  private _position: Vector3 = new Vector3();
  private _rotation: Vector3 = new Vector3();
  private _rotationQuaternion: Vector4 = quat.create();
  private _scale: Vector3 = new Vector3(1, 1, 1);
  private _worldPosition: Vector3 = new Vector3();
  private _worldRotation: Vector3 = new Vector3();
  private _worldRotationQuaternion: Vector4 = quat.create();
  private _lossyWorldScale: Vector3 = new Vector3(1, 1, 1);
  private _localMatrix: Matrix4x4 = mat4.create();
  private _worldMatrix: Matrix4x4 = mat4.create();
  private _dirtyFlag: number = Transform._WM_WP_WE_WQ_WS_FLAGS;
  private _changeFlags: UpdateFlag[] = [];
  private _isParentDirty: boolean = true;
  private _parentTransformCache: Transform = null;

  /**
   * 局部位置。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (this._position !== value) {
      value.cloneTo(this._position);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG);
    this._updateWorldPositionFlag();
  }

  /**
   * 世界位置。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldPosition(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_POSITION_FLAG)) {
      if (this._getParentTransform()) {
        mat4.getTranslation(this._worldPosition, this.worldMatrix);
      } else {
        this._position.cloneTo(this._worldPosition);
      }
      this._setDirtyFlagFalse(Transform._WORLD_POSITION_FLAG);
    }
    return this._worldPosition;
  }

  set worldPosition(value: Vector3) {
    if (this._worldPosition !== value) {
      value.cloneTo(this._worldPosition);
    }
    const parent = this._getParentTransform();
    if (parent) {
      const matWorldToLocal = mat4.invert(Transform._tempMat41, parent.worldMatrix);
      Vector3.transformMat4x4(value, matWorldToLocal, this._position);
    } else {
      value.cloneTo(this._worldPosition);
    }
    this.position = this._worldPosition;
    this._setDirtyFlagFalse(Transform._WORLD_POSITION_FLAG);
  }

  /**
   * 局部旋转，欧拉角表达，单位是角度制。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get rotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._LOCAL_EULER_FLAG)) {
      quat.toEuler(this._rotation, this._rotationQuaternion);
      this._setDirtyFlagFalse(Transform._LOCAL_EULER_FLAG);
    }
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation !== value) {
      value.cloneTo(this._rotation);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_QUAT_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_EULER_FLAG);
    this._updateWorldRotationFlag();
  }

  /**
   * 世界旋转，欧拉角表达，单位是角度制。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldRotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_EULER_FLAG)) {
      quat.toEuler(this._worldRotation, this.worldRotationQuaternion);
      this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
    }
    return this._worldRotation;
  }

  set worldRotation(value: Vector3) {
    if (this._worldRotation !== value) {
      value.cloneTo(this._worldRotation);
    }
    quat.fromEuler(this._worldRotationQuaternion, value.x, value.y, value.z);
    this.worldRotationQuaternion = this._worldRotationQuaternion;
    this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
  }

  /**
   * 局部旋转，四元数表达。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get rotationQuaternion(): Vector4 {
    if (this._isContainDirtyFlag(Transform._LOCAL_QUAT_FLAG)) {
      quat.fromEuler(this._rotationQuaternion, this._rotation.x, this._rotation.y, this._rotation.z);
      this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: Vector4) {
    if (this._rotationQuaternion !== value) {
      quat.copy(this._rotationQuaternion, value);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    this._updateWorldRotationFlag();
  }

  /**
   * 世界旋转，四元数表达。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldRotationQuaternion(): Vector4 {
    if (this._isContainDirtyFlag(Transform._WORLD_QUAT_FLAG)) {
      const parent = this._getParentTransform();
      if (parent != null) {
        quat.multiply(this._worldRotationQuaternion, parent.worldRotationQuaternion, this.rotationQuaternion);
      } else {
        quat.copy(this._worldRotationQuaternion, this.rotationQuaternion);
      }
      this._setDirtyFlagFalse(Transform._WORLD_QUAT_FLAG);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: Vector4) {
    if (this._worldRotationQuaternion !== value) {
      quat.copy(this._worldRotationQuaternion, value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      const quatWorldToLocal = quat.invert(Transform._tempVec41, parent.worldRotationQuaternion);
      quat.multiply(this._rotationQuaternion, value, quatWorldToLocal);
    } else {
      quat.copy(this._rotationQuaternion, value);
    }
    this.rotationQuaternion = this._rotationQuaternion;
    this._setDirtyFlagFalse(Transform._WORLD_QUAT_FLAG);
  }

  /**
   * 局部缩放。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get scale(): Vector3 {
    return this._scale;
  }

  set scale(value: Vector3) {
    if (this._scale !== value) {
      value.cloneTo(this._scale);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG);
    this._updateWorldScaleFlag();
  }

  /**
   * 世界有损缩放。
   */
  get lossyWorldScale(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_SCALE_FLAG)) {
      if (this._getParentTransform()) {
        const scaleMat = this._getScaleMatrix();
        this._lossyWorldScale.setValue(scaleMat.x, scaleMat[4], scaleMat[8]);
      } else {
        this._scale.cloneTo(this._lossyWorldScale);
      }
      this._setDirtyFlagFalse(Transform._WORLD_SCALE_FLAG);
    }
    return this._lossyWorldScale;
  }

  /**
   * 局部矩阵。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get localMatrix(): Matrix4x4 {
    if (this._isContainDirtyFlag(Transform._LOCAL_MATRIX_FLAG)) {
      mat4.fromRotationTranslationScale(this._localMatrix, this.rotationQuaternion, this._position, this._scale);
      this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    }
    return this._localMatrix;
  }

  set localMatrix(value: Matrix4x4) {
    if (this._localMatrix !== value) {
      mat4.copy(this._localMatrix, value);
    }
    mat4.decompose(this._localMatrix, this._position, this._rotationQuaternion, this._scale);
    this._setDirtyFlagTrue(Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    this._updateAllWorldFlag();
  }

  /**
   * 世界矩阵。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldMatrix(): Matrix4x4 {
    if (this._isContainDirtyFlag(Transform._WORLD_MATRIX_FLAG)) {
      const parent = this._getParentTransform();
      if (parent) {
        mat4.multiply(this._worldMatrix, parent.worldMatrix, this.localMatrix);
      } else {
        mat4.copy(this._worldMatrix, this.localMatrix);
      }
      this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: Matrix4x4) {
    if (this._worldMatrix !== value) {
      mat4.copy(this._worldMatrix, value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      const matWorldToLocal = mat4.invert(Transform._tempMat42, parent.worldMatrix);
      mat4.multiply(this._localMatrix, value, matWorldToLocal);
    } else {
      mat4.copy(this._localMatrix, value);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
  }

  /**
   * @internal
   * 构建一个变换组件。
   */
  constructor(entity?: Entity) {
    super(entity);
  }

  /**
   * 获取世界矩阵的前向量。
   * @param forward - 前向量
   * @returns 前向量
   */
  getWorldForward(forward: Vector3): Vector3 {
    const worldMatrix = this.worldMatrix;
    forward.setValue(worldMatrix[8], worldMatrix[9], worldMatrix[10]);
    return forward.normalize();
  }

  /**
   * 获取世界矩阵的右向量。
   * @param right - 右向量
   * @returns 右向量
   */
  getWorldRight(right: Vector3): Vector3 {
    const worldMatrix = this.worldMatrix;
    right.setValue(worldMatrix.x, worldMatrix.y, worldMatrix.z);
    return right.normalize();
  }

  /**
   * 获取世界矩阵的上向量。
   * @param up - 上向量
   * @returns 上向量
   */
  getWorldUp(up: Vector3): Vector3 {
    const worldMatrix = this.worldMatrix;
    up.setValue(worldMatrix[4], worldMatrix[5], worldMatrix[6]);
    return up.normalize();
  }

  /**
   * 在指定的方向和距离上位移。
   * @param translation - 位移的方向和距离
   * @param relativeToLocal - 是否相对局部空间
   */
  translate(translation: Vector3, relativeToLocal: boolean = true): void {
    if (relativeToLocal) {
      const rotationMat = Transform._tempMat40;
      mat4.fromQuat(rotationMat, this.rotationQuaternion);
      Vector3.transformMat4x4(translation, rotationMat, Transform._tempVec3);
      this.position = this._position.add(Transform._tempVec3);
    } else {
      this.worldPosition = this._worldPosition.add(translation);
    }
  }

  /**
   * 根据指定欧拉角旋转。
   * @param rotation - 旋转角度，欧拉角表达，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotate(rotation: Vector3, relativeToLocal: boolean = true): void {
    const rotateQuat = quat.fromEuler(Transform._tempVec40, rotation.x, rotation.y, rotation.z);
    this._rotateByQuat(rotateQuat, relativeToLocal);
  }

  /**
   * 根据指定角度围绕指定轴进行旋转。
   * @param axis - 旋转轴
   * @param angle - 旋转角度，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateByAxis(axis: Vector3, angle: number, relativeToLocal: boolean = true): void {
    const rad = (angle * Math.PI) / 180;
    const rotateQuat = quat.setAxisAngle(Transform._tempVec40, axis, rad);
    this._rotateByQuat(rotateQuat, relativeToLocal);
  }

  /**
   * 旋转并且保证世界前向量指向目标世界位置。
   * @param worldPosition - 目标世界位置
   * @param worldUp - 世界上向量，默认是 [0, 1, 0]
   */
  lookAt(worldPosition: Vector3, worldUp?: Vector3): void {
    const position = this.worldPosition;
    const EPSILON = MathUtil.ZeroTolerance;
    if (
      //todo:如果数学苦做保护了的话，可以删除
      Math.abs(position.x - worldPosition.x) < EPSILON &&
      Math.abs(position.y - worldPosition.y) < EPSILON &&
      Math.abs(position.z - worldPosition.z) < EPSILON
    ) {
      return;
    }
    worldUp = worldUp ?? Transform._tempVec3.setValue(0, 1, 0);
    const modelMatrix = mat4.lookAtR(Transform._tempMat43, position, worldPosition, worldUp); //CM:可采用3x3矩阵优化
    this.worldRotationQuaternion = mat4.getRotation(Transform._tempVec40, modelMatrix); //CM:正常应该再求一次逆，因为lookat的返回值相当于viewMatrix,viewMatrix是世界矩阵的逆，需要测试一个模型和相机分别lookAt一个物体的效果（是否正确和lookAt方法有关）
  }

  /**
   * 注册世界变换改变标记。
   * @returns 改变标记
   */
  registerWorldChangeFlag(): UpdateFlag {
    const flag = new UpdateFlag(this._changeFlags);
    this._changeFlags.push(flag);
    return flag;
  }

  _onDestroy() {
    for (let i = 0, len = this._changeFlags.length; i < len; i++) {
      this._changeFlags[i].destroy();
    }
  }

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateAllWorldFlag();
  }

  /**
   * @internal
   */
  _cloneTo(target: Transform): Transform {
    target.localMatrix = this.localMatrix;
    return target;
  }

  /**
   * 获取 worldMatrix：会触发自身以及所有父节点的worldMatrix更新
   * 获取 worldPosition：会触发自身 position 和自身 worldMatrix 以及所有父节点的 worldMatrix 更新
   * 综上所述：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix）的脏标记为 false
   */
  private _updateWorldPositionFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionFlag();
      }
    }
  }

  /**
   * 获取worldMatrix：会触发自身以及所有父节点的worldMatrix更新
   * 获取worldPosition：会触发自身position和自身worldMatrix以及所有父节点的worldMatrix更新
   * 获取worldRotationQuaternion：会触发自身以及所有父节点的worldRotationQuaternion更新
   * 获取worldRotation：会触发自身worldRotation和自身worldRotationQuaternion以及所有父节点的worldRotationQuaternion更新
   * 综上所述：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix或orldRotationQuaternion）的脏标记为false
   */
  private _updateWorldRotationFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WE_WQ_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WE_WQ_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndRotationFlag(); //父节点旋转发生变化，子节点的世界位置和旋转都需要更新
      }
    }
  }

  /**
   * 获取 worldMatrix：会触发自身以及所有父节点的 worldMatrix 更新
   * 获取 worldPosition：会触发自身 position 和自身 worldMatrix 以及所有父节点的 worldMatrix 更新
   * 获取 worldRotationQuaternion：会触发自身以及所有父节点的 worldRotationQuaternion 更新
   * 获取 worldRotation：会触发自身 worldRotation 和自身 worldRotationQuaternion 以及所有父节点的worldRotationQuaternion更新
   * 综上所述：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix 或 worldRotationQuaternion）的脏标记为false
   */
  private _updateWorldPositionAndRotationFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WE_WQ_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WE_WQ_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndRotationFlag();
      }
    }
  }

  /**
   * 获取 worldMatrix：会触发自身以及所有父节点的 worldMatrix 更新
   * 获取 worldPosition：会触发自身 position 和自身 worldMatrix 以及所有父节点的 worldMatrix 更新
   * 获取 worldScale：会触发自身以及所有父节点的 worldMatrix 更新
   * 综上所述：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix）的脏标记为 false。
   */
  private _updateWorldScaleFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndScaleFlag();
      }
    }
  }

  /**
   * 获取 worldMatrix：会触发自身以及所有父节点的 worldMatrix 更新
   * 获取 worldPosition：会触发自身 position 和自身 worldMatrix 以及所有父节点的 worldMatrix 更新
   * 获取 worldScale：会触发自身以及所有父节点的worldMatrix更新
   * 综上所述：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix）的脏标记为 false。
   */
  private _updateWorldPositionAndScaleFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndScaleFlag();
      }
    }
  }

  /**
   * 更新所有世界标记，原理同上。
   */
  private _updateAllWorldFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WE_WQ_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WE_WQ_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateAllWorldFlag();
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
    const invRotation = Transform._tempVec40;
    const invRotationMat = Transform._tempMat30;
    const worldRotScaMat = Transform._tempMat31;
    const scaMat = Transform._tempMat32;
    mat3.fromMat4(worldRotScaMat, this.worldMatrix);
    quat.invert(invRotation, this.worldRotationQuaternion);
    mat3.fromQuat(invRotation, invRotationMat);
    mat3.multiply(scaMat, invRotationMat, worldRotScaMat);
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
    const len = this._changeFlags.length;
    for (let i = len - 1; i >= 0; i--) {
      this._changeFlags[i].flag = true;
    }
  }

  private _rotateByQuat(rotateQuat: Vector4, relativeToLocal: boolean) {
    if (relativeToLocal) {
      quat.multiply(this._rotationQuaternion, this.rotationQuaternion, rotateQuat);
      this.rotationQuaternion = this._rotationQuaternion;
    } else {
      quat.multiply(this._worldRotationQuaternion, this.worldRotationQuaternion, rotateQuat);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
    }
  }
}
