import { MathUtil, Matrix, Matrix3x3, Quaternion, Vector3 } from "@alipay/o3-math";
import { deepClone, ignoreClone, shallowClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { UpdateFlag } from "./UpdateFlag";

/**
 * 用于实现变换相关功能。
 */
export class Transform extends Component {
  private static _tempQuat0: Quaternion = new Quaternion();
  private static _tempVec3: Vector3 = new Vector3();
  private static _tempMat30: Matrix3x3 = new Matrix3x3();
  private static _tempMat31: Matrix3x3 = new Matrix3x3();
  private static _tempMat32: Matrix3x3 = new Matrix3x3();
  private static _tempMat40: Matrix = new Matrix();
  private static _tempMat41: Matrix = new Matrix();
  private static _tempMat42: Matrix = new Matrix();
  private static _tempMat43: Matrix = new Matrix();

  private static _LOCAL_EULER_FLAG: number = 0x1;
  private static _LOCAL_QUAT_FLAG: number = 0x2;
  private static _WORLD_POSITION_FLAG: number = 0x4;
  private static _WORLD_EULER_FLAG: number = 0x8;
  private static _WORLD_QUAT_FLAG: number = 0x10;
  private static _WORLD_SCALE_FLAG: number = 0x20;
  private static _LOCAL_MATRIX_FLAG: number = 0x40;
  private static _WORLD_MATRIX_FLAG: number = 0x80;

  /** _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG */
  private static _WM_WP_FLAGS: number = 0x84;
  /** _WORLD_MATRIX_FLAG | _WORLD_EULER_FLAG | _WORLD_QUAT_FLAG */
  private static _WM_WE_WQ_FLAGS: number = 0x98;
  /** _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG | _WORLD_EULER_FLAG ｜ _WORLD_QUAT_FLAG */
  private static _WM_WP_WE_WQ_FLAGS: number = 0x9c;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WS_FLAGS: number = 0xa0;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WP_WS_FLAGS: number = 0xa4;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_EULER_FLAG | Transform._WORLD_QUAT_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WP_WE_WQ_WS_FLAGS: number = 0xbc;

  @deepClone
  private _position: Vector3 = new Vector3();
  @deepClone
  private _rotation: Vector3 = new Vector3();
  @deepClone
  private _rotationQuaternion: Quaternion = new Quaternion();
  @deepClone
  private _scale: Vector3 = new Vector3(1, 1, 1);
  @deepClone
  private _worldPosition: Vector3 = new Vector3();
  @deepClone
  private _worldRotation: Vector3 = new Vector3();
  @deepClone
  private _worldRotationQuaternion: Quaternion = new Quaternion();
  @deepClone
  private _lossyWorldScale: Vector3 = new Vector3(1, 1, 1);
  @deepClone
  private _localMatrix: Matrix = new Matrix();
  @deepClone
  private _worldMatrix: Matrix = new Matrix();
  @shallowClone
  private _dirtyFlag: number = Transform._WM_WP_WE_WQ_WS_FLAGS;
  @ignoreClone
  private _changeFlags: UpdateFlag[] = [];
  @ignoreClone
  private _isParentDirty: boolean = true;
  @ignoreClone
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
        this.worldMatrix.getTranslation(this._worldPosition);
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
      Matrix.invert(parent.worldMatrix, Transform._tempMat41);
      Vector3.transformCoordinate(value, Transform._tempMat41, this._position);
    } else {
      value.cloneTo(this._position);
    }
    this.position = this._position;
    this._setDirtyFlagFalse(Transform._WORLD_POSITION_FLAG);
  }

  /**
   * 局部旋转，欧拉角表达，单位是角度制，欧拉角的旋转顺序为 Yaw、Pitch、Roll。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get rotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._LOCAL_EULER_FLAG)) {
      this._rotationQuaternion.toEuler(this._rotation);
      this._rotation.scale(MathUtil.radToDegreeFactor); // 弧度转角度

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
   * 世界旋转，欧拉角表达，单位是角度制，欧拉角的旋转顺序为 Yaw、Pitch、Roll。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldRotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_EULER_FLAG)) {
      this.worldRotationQuaternion.toEuler(this._worldRotation);
      this._worldRotation.scale(MathUtil.radToDegreeFactor); // 弧度转角度
      this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
    }
    return this._worldRotation;
  }

  set worldRotation(value: Vector3) {
    if (this._worldRotation !== value) {
      value.cloneTo(this._worldRotation);
    }
    Quaternion.rotationEuler(
      MathUtil.degreeToRadian(value.x),
      MathUtil.degreeToRadian(value.y),
      MathUtil.degreeToRadian(value.z),
      this._worldRotationQuaternion
    );
    this.worldRotationQuaternion = this._worldRotationQuaternion;
    this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
  }

  /**
   * 局部旋转，四元数表达。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get rotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(Transform._LOCAL_QUAT_FLAG)) {
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(this._rotation.x),
        MathUtil.degreeToRadian(this._rotation.y),
        MathUtil.degreeToRadian(this._rotation.z),
        this._rotationQuaternion
      );
      this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: Quaternion) {
    if (this._rotationQuaternion !== value) {
      value.cloneTo(this._rotationQuaternion);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    this._updateWorldRotationFlag();
  }

  /**
   * 世界旋转，四元数表达。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldRotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(Transform._WORLD_QUAT_FLAG)) {
      const parent = this._getParentTransform();
      if (parent != null) {
        Quaternion.multiply(parent.worldRotationQuaternion, this.rotationQuaternion, this._worldRotationQuaternion);
      } else {
        this.rotationQuaternion.cloneTo(this._worldRotationQuaternion);
      }
      this._setDirtyFlagFalse(Transform._WORLD_QUAT_FLAG);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: Quaternion) {
    if (this._worldRotationQuaternion !== value) {
      value.cloneTo(this._worldRotationQuaternion);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Quaternion.invert(parent.worldRotationQuaternion, Transform._tempQuat0);
      Quaternion.multiply(value, Transform._tempQuat0, this._rotationQuaternion);
    } else {
      value.cloneTo(this._rotationQuaternion);
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
   * @remarks 某种条件下获取该值可能不正确（例如：父节点有缩放，子节点有旋转），缩放会倾斜，无法使用 Vector3 正确表示,必须使用 Matrix3x3 矩阵才能正确表示。
   */
  get lossyWorldScale(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_SCALE_FLAG)) {
      if (this._getParentTransform()) {
        const scaleMat = this._getScaleMatrix();
        const e = scaleMat.elements;
        this._lossyWorldScale.setValue(e[0], e[4], e[8]);
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
  get localMatrix(): Matrix {
    if (this._isContainDirtyFlag(Transform._LOCAL_MATRIX_FLAG)) {
      Matrix.affineTransformation(this._scale, this.rotationQuaternion, this._position, this._localMatrix);
      this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    }
    return this._localMatrix;
  }

  set localMatrix(value: Matrix) {
    if (this._localMatrix !== value) {
      value.cloneTo(this._localMatrix);
    }
    this._localMatrix.decompose(this._position, this._rotationQuaternion, this._scale);
    this._setDirtyFlagTrue(Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    this._updateAllWorldFlag();
  }

  /**
   * 世界矩阵。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get worldMatrix(): Matrix {
    if (this._isContainDirtyFlag(Transform._WORLD_MATRIX_FLAG)) {
      const parent = this._getParentTransform();
      if (parent) {
        Matrix.multiply(parent.worldMatrix, this.localMatrix, this._worldMatrix);
      } else {
        this.localMatrix.cloneTo(this._worldMatrix);
      }
      this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: Matrix) {
    if (this._worldMatrix !== value) {
      value.cloneTo(this._worldMatrix);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat42);
      Matrix.multiply(value, Transform._tempMat42, this._localMatrix);
    } else {
      value.cloneTo(this._localMatrix);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
  }

  /**
   * 通过位置的 X Y Z 设置局部位置。
   * @param x - 位置的 X 坐标
   * @param y - 位置的 Y 坐标
   * @param z - 位置的 Z 坐标
   */
  setPosition(x: number, y: number, z: number): void {
    this._position.setValue(x, y, z);
    this.position = this._position;
  }

  /**
   * 通过欧拉角的 X、Y、Z 分量设置局部旋转，单位是角度制，欧拉角的旋转顺序为 Yaw、Pitch、Roll。
   * @param x - 绕 X 轴旋转的角度
   * @param y - 绕 Y 轴旋转的角度
   * @param z - 绕 Z 轴旋转的角度
   */
  setRotation(x: number, y: number, z: number): void {
    this._rotation.setValue(x, y, z);
    this.rotation = this._rotation;
  }

  /**
   * 通过四元数的 X、Y、Z、W 分量设置局部旋转。
   * @param x - 四元数的 X 分量
   * @param y - 四元数的 Y 分量
   * @param z - 四元数的 Z 分量
   * @param w - 四元数的 W 分量
   */
  setRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._rotationQuaternion.setValue(x, y, z, w);
    this.rotationQuaternion = this._rotationQuaternion;
  }

  /**
   * 通过沿 X、Y、Z 的缩放值设置局部缩放。
   * @param x - 沿 X 缩放
   * @param y - 沿 Y 缩放
   * @param z - 沿 Z 缩放
   */
  setScale(x: number, y: number, z: number): void {
    this._scale.setValue(x, y, z);
    this.scale = this._scale;
  }

  /**
   * 通过位置的 X Y Z 设置世界位置。
   * @param x - 位置的 X 坐标
   * @param y - 位置的 Y 坐标
   * @param z - 位置的 Z 坐标
   */
  setWorldPosition(x: number, y: number, z: number): void {
    this._worldPosition.setValue(x, y, z);
    this.worldPosition = this._worldPosition;
  }

  /**
   * 通过欧拉角的 X、Y、Z 分量设置世界旋转，单位是角度制，欧拉角的旋转顺序为 Yaw、Pitch、Roll。
   * @param x - 绕 X 轴旋转的角度
   * @param y - 绕 Y 轴旋转的角度
   * @param z - 绕 Z 轴旋转的角度
   */
  setWorldRotation(x: number, y: number, z: number): void {
    this._worldRotation.setValue(x, y, z);
    this.worldRotation = this._worldRotation;
  }

  /**
   * 通过四元数的 X、Y、Z、W 分量设置世界旋转。
   * @param x - 四元数的 X 分量
   * @param y - 四元数的 Y 分量
   * @param z - 四元数的 Z 分量
   * @param w - 四元数的 W 分量
   */
  setWorldRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._worldRotationQuaternion.setValue(x, y, z, w);
    this.worldRotationQuaternion = this._worldRotationQuaternion;
  }

  /**
   * 获取世界矩阵的前向量。
   * @param forward - 前向量
   * @returns 前向量
   */
  getWorldForward(forward: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    forward.setValue(-e[8], -e[9], -e[10]);
    return forward.normalize();
  }

  /**
   * 获取世界矩阵的右向量。
   * @param right - 右向量
   * @returns 右向量
   */
  getWorldRight(right: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    right.setValue(e[0], e[1], e[2]);
    return right.normalize();
  }

  /**
   * 获取世界矩阵的上向量。
   * @param up - 上向量
   * @returns 上向量
   */
  getWorldUp(up: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    up.setValue(e[4], e[5], e[6]);
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
      Matrix.rotationQuaternion(this.rotationQuaternion, rotationMat);
      Vector3.transformCoordinate(translation, rotationMat, Transform._tempVec3);
      this.position = this._position.add(Transform._tempVec3);
    } else {
      this.worldPosition = this._worldPosition.add(translation);
    }
  }

  /**
   * 在指定的方向和距离上位移。
   * @param x - X 轴的位移的方向和距离
   * @param y - Y 轴的位移的方向和距离
   * @param z - Z 轴的位移的方向和距离
   * @param relativeToLocal - 是否相对局部空间
   */
  translateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    const translate = Transform._tempVec3;
    translate.setValue(x, y, z);
    this.translate(translate, relativeToLocal);
  }

  /**
   * 根据指定欧拉角旋转。
   * @param rotation - 旋转角度，欧拉角表达，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotate(rotation: Vector3, relativeToLocal: boolean = true): void {
    this.rotateXYZ(rotation.x, rotation.y, rotation.z, relativeToLocal);
  }

  /**
   * 根据指定欧拉角旋转。
   * @param x - X 轴旋转角度,单位是角度制
   * @param y - Y 轴旋转角度,单位是角度制
   * @param z - Z 轴旋转角度,单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    const radFactor = MathUtil.degreeToRadFactor;
    const rotQuat = Transform._tempQuat0;
    Quaternion.rotationEuler(x * radFactor, y * radFactor, z * radFactor, rotQuat);
    this._rotateByQuat(rotQuat, relativeToLocal);
  }

  /**
   * 根据指定角度围绕指定轴进行旋转。
   * @param axis - 旋转轴
   * @param angle - 旋转角度，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateByAxis(axis: Vector3, angle: number, relativeToLocal: boolean = true): void {
    const rad = angle * MathUtil.degreeToRadFactor;
    Quaternion.rotationAxisAngle(axis, rad, Transform._tempQuat0);
    this._rotateByQuat(Transform._tempQuat0, relativeToLocal);
  }

  /**
   * 旋转并且保证世界前向量指向目标世界位置。
   * @param worldPosition - 目标世界位置
   * @param worldUp - 世界上向量，默认是 Vector3(0, 1, 0)
   */
  lookAt(worldPosition: Vector3, worldUp?: Vector3): void {
    const position = this.worldPosition;
    const EPSILON = MathUtil.zeroTolerance;
    if (
      //todo:如果数学苦做保护了的话，可以删除
      Math.abs(position.x - worldPosition.x) < EPSILON &&
      Math.abs(position.y - worldPosition.y) < EPSILON &&
      Math.abs(position.z - worldPosition.z) < EPSILON
    ) {
      return;
    }
    worldUp = worldUp ?? Transform._tempVec3.setValue(0, 1, 0);
    const mat = Transform._tempMat43;
    Matrix.lookAt(position, worldPosition, worldUp, mat); //CM:可采用3x3矩阵优化
    mat.invert();

    this.worldRotationQuaternion = mat.getRotation(this._worldRotationQuaternion); //CM:正常应该再求一次逆，因为lookat的返回值相当于viewMatrix,viewMatrix是世界矩阵的逆，需要测试一个模型和相机分别lookAt一个物体的效果（是否正确和lookAt方法有关）
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

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateAllWorldFlag();
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
    const invRotation = Transform._tempQuat0;
    const invRotationMat = Transform._tempMat30;
    const worldRotScaMat = Transform._tempMat31;
    const scaMat = Transform._tempMat32;
    worldRotScaMat.setValueByMatrix(this.worldMatrix);
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
    const len = this._changeFlags.length;
    for (let i = len - 1; i >= 0; i--) {
      this._changeFlags[i].flag = true;
    }
  }

  private _rotateByQuat(rotateQuat: Quaternion, relativeToLocal: boolean) {
    if (relativeToLocal) {
      Quaternion.multiply(this.rotationQuaternion, rotateQuat, this._rotationQuaternion);
      this.rotationQuaternion = this._rotationQuaternion;
    } else {
      Quaternion.multiply(this.worldRotationQuaternion, rotateQuat, this._worldRotationQuaternion);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
    }
  }
}
