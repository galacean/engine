import { vec3, quat, mat4, vec4, mat3 } from "@alipay/o3-math";
import { Node } from "./Node";
import { NodeAbility } from "./NodeAbility";
import { vec3Type, vec4Type, mat4Type, mat3Type } from "./type";

type TransformProps = {
  scale?: vec3Type;
  position?: vec3Type;
  rotation?: vec3Type;
  rotationQuaternion?: vec4Type;
};

//CM:vec3Type、vec4Type、mat3Type、mat4Type类型更换
//CM:相关get方法修改为ReadOnly<T>类型
export class Transform extends NodeAbility {
  // Temp
  private static _tempVec3: vec3Type = vec3.create();
  private static _tempVec4: vec4Type = vec4.create();
  private static _tempMat3: mat3Type = mat3.create();
  private static _tempMat4: mat4Type = mat4.create();

  private static _tempMat31: mat3Type = mat3.create();
  private static _tempMat41: mat4Type = mat4.create();

  private static _tempMat32: mat3Type = mat3.create();
  private static _tempMat42: mat4Type = mat4.create();

  private static _tempMat43: mat4Type = mat4.create();

  // Dirty flag
  private static _LOCAL_EULER_FLAG: number = 0x1;
  private static _LOCAL_QUAT_FLAG: number = 0x2;

  private static _WORLD_POSITION_FLAG: number = 0x4;
  private static _WORLD_EULER_FLAG: number = 0x8;
  private static _WORLD_QUAT_FLAG: number = 0x10;
  private static _WORLD_SCALE_FLAG: number = 0x20;

  private static _LOCAL_MATRIX_FLAG: number = 0x40;
  private static _WORLD_MATRIX_FLAG: number = 0x80;
  private static _WM_WP_FLAG: number = Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG;
  private static _WM_WE_WQ_FLAG: number =
    Transform._WORLD_MATRIX_FLAG | Transform._WORLD_EULER_FLAG | Transform._WORLD_QUAT_FLAG;
  private static _WM_WP_WE_WQ_FLAG: number =
    Transform._WORLD_MATRIX_FLAG |
    Transform._WORLD_POSITION_FLAG |
    Transform._WORLD_EULER_FLAG |
    Transform._WORLD_QUAT_FLAG;

  // Properties
  private _position: vec3Type = vec3.create();
  private _rotation: vec3Type = vec3.create();
  private _rotationQuaternion: vec4Type = quat.create();
  private _scale: vec3Type = vec3.fromValues(1, 1, 1);

  private _worldPosition: vec3Type = vec3.create();
  private _worldRotation: vec3Type = vec3.create();
  private _worldRotationQuaternion: vec4Type = quat.create();
  private _lossyWorldScale: vec3Type = vec3.fromValues(1, 1, 1);

  private _localMatrix: mat4Type = mat4.create();
  private _worldMatrix: mat4Type = mat4.create();

  private _parent = null; //CM:要写类型
  private _children: Transform[] = [];
  private _dirtyFlag: number = 0;

  /**
   * 父变换
   * @todo 后续直接更名为parent
   */
  get parentTransform(): Transform {
    return this._parent;
  }

  //CM:应该做成内部方法，开发者不允许调用
  set parentTransform(value: Transform) {
    this._parent = value;
    this._parent._children.push(this);
  }

  /**
   * 子变换数量
   */
  //CM:更名为childCount
  get childTransformCount(): number {
    return this._children.length;
  }

  /**
   * 局部位置
   */
  get position(): vec3Type {
    return this._position;
  }

  set position(value: vec3Type) {
    if (this._position !== value) {
      vec3.copy(this._position, value);
    }
    this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG, true);
    this._updateWorldPositionFlag();
  }

  /**
   * 世界位置
   */
  get worldPosition(): vec3Type {
    if (this._getDirtyFlag(Transform._WORLD_POSITION_FLAG)) {
      if (this._parent) {
        mat4.getTranslation(this._worldPosition, this.worldMatrix);
      } else {
        vec3.copy(this._worldPosition, this._position);
      }
      this._setDirtyFlag(Transform._WORLD_POSITION_FLAG, false);
    }
    return this._worldPosition;
  }

  set worldPosition(value: vec3Type) {
    if (this._worldPosition !== value) {
      vec3.copy(this._worldPosition, value);
    }
    if (this._parent) {
      const matWorldToLocal = mat4.invert(Transform._tempMat41, this._parent.worldMatrix);
      vec3.transformMat4(this._worldPosition, value, matWorldToLocal);
    } else {
      vec3.copy(this._worldPosition, value);
    }
    this.position = this._worldPosition;
    this._setDirtyFlag(Transform._WORLD_POSITION_FLAG, false);
  }

  /**
   * 局部旋转，欧拉角表达,单位是角度制
   */
  get rotation(): vec3Type {
    if (this._getDirtyFlag(Transform._LOCAL_EULER_FLAG)) {
      quat.toEuler(this._rotation, this._rotationQuaternion);
      this._setDirtyFlag(Transform._LOCAL_EULER_FLAG, false);
    }
    return this._rotation;
  }

  set rotation(value: vec3Type) {
    if (this._rotation !== value) {
      vec3.copy(this._rotation, value);
    }
    this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_QUAT_FLAG, true);
    this._setDirtyFlag(Transform._LOCAL_EULER_FLAG, false);
    this._updateWorldRotationFlag();
  }

  /**
   * 世界旋转，欧拉角表达,单位是角度制
   */
  get worldRotation(): vec3Type {
    if (this._getDirtyFlag(Transform._WORLD_EULER_FLAG)) {
      quat.toEuler(this._worldRotation, this.worldRotationQuaternion);
      this._setDirtyFlag(Transform._WORLD_EULER_FLAG, false);
    }
    return this._worldRotation;
  }

  set worldRotation(value: vec3Type) {
    if (this._worldRotation !== value) {
      vec3.copy(this._worldRotation, value);
    }
    quat.fromEuler(this._worldRotationQuaternion, value[0], value[1], value[2]);
    this.worldRotationQuaternion = this._worldRotationQuaternion;
    this._setDirtyFlag(Transform._WORLD_EULER_FLAG, false);
  }

  /**
   * 局部旋转，四元数表达
   */
  get rotationQuaternion(): vec4Type {
    if (this._getDirtyFlag(Transform._LOCAL_QUAT_FLAG)) {
      quat.fromEuler(this._rotationQuaternion, this._rotation[0], this._rotation[1], this._rotation[2]);
      this._setDirtyFlag(Transform._LOCAL_QUAT_FLAG, false);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: vec4Type) {
    if (this._rotationQuaternion !== value) {
      quat.copy(this._rotationQuaternion, value);
    }
    this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_EULER_FLAG, true);
    this._setDirtyFlag(Transform._LOCAL_QUAT_FLAG, false);
    this._updateWorldRotationFlag();
  }

  /**
   *世界旋转，四元数表达
   */
  get worldRotationQuaternion(): vec4Type {
    if (this._getDirtyFlag(Transform._WORLD_QUAT_FLAG)) {
      if (this._parent != null) {
        quat.multiply(this._worldRotationQuaternion, this._parent.worldRotationQuaternion, this.rotationQuaternion);
      } else {
        quat.copy(this._worldRotationQuaternion, this.rotationQuaternion);
      }
      this._setDirtyFlag(Transform._WORLD_QUAT_FLAG, false);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: vec4Type) {
    if (this._worldRotationQuaternion !== value) {
      quat.copy(this._worldRotationQuaternion, value);
    }
    if (this._parent) {
      const quatWorldToLocal = mat4.invert(Transform._tempVec4, this._parent.worldRotationQuaternion);
      quat.multiply(this._rotationQuaternion, value, quatWorldToLocal);
    } else {
      quat.copy(this._rotationQuaternion, value);
    }
    this.rotationQuaternion = this._rotationQuaternion;
    this._setDirtyFlag(Transform._WORLD_QUAT_FLAG, false);
  }

  /**
   * 局部缩放
   */
  get scale(): vec3Type {
    return this._scale;
  }

  set scale(value: vec3Type) {
    if (this._scale !== value) {
      vec3.copy(this._scale, value);
    }
    this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG, true);
    this._updateWorldScale();
  }

  /**
   * 世界缩放
   */
  get lossyWorldScale(): vec3Type {
    if (this._getDirtyFlag(Transform._WORLD_SCALE_FLAG)) {
      if (this._parent) {
        const scaleMat = this._getScaleMatrix();
        this._lossyWorldScale = [scaleMat[0], scaleMat[4], scaleMat[8]];
      } else {
        this._lossyWorldScale = this._scale;
      }
      this._setDirtyFlag(Transform._WORLD_SCALE_FLAG, false);
    }
    return this._lossyWorldScale;
  }

  /**
   * 局部矩阵
   */
  get localMatrix(): mat4Type {
    if (this._getDirtyFlag(Transform._LOCAL_MATRIX_FLAG)) {
      mat4.fromRotationTranslationScale(this._localMatrix, this.rotationQuaternion, this._position, this._scale);
      this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG, false);
    }
    return this._localMatrix;
  }

  set localMatrix(value: mat4Type) {
    if (this._localMatrix !== value) {
      mat4.copy(this._localMatrix, value);
    }
    mat4.decompose(this._localMatrix, this._position, this._rotationQuaternion, this._scale);
    this._setDirtyFlag(Transform._LOCAL_MATRIX_FLAG, false);
    this._updateAll();
  }

  /**
   * 世界矩阵
   */
  get worldMatrix(): mat4Type {
    if (this._getDirtyFlag(Transform._WORLD_MATRIX_FLAG)) {
      if (this._parent) {
        mat4.multiply(this._worldMatrix, this._parent.worldMatrix, this.localMatrix);
      } else {
        this._worldMatrix = this.localMatrix;
      }
      this._setDirtyFlag(Transform._WORLD_MATRIX_FLAG, false);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: mat4Type) {
    if (this._worldMatrix !== value) {
      mat4.copy(this._worldMatrix, value);
    }
    if (this._parent) {
      const matWorldToLocal = mat4.invert(Transform._tempMat42, this._parent.worldMatrix);
      mat4.multiply(this._localMatrix, value, matWorldToLocal);
    } else {
      mat4.copy(this._localMatrix, value);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlag(Transform._WORLD_MATRIX_FLAG, false);
  }

  constructor(node: Node, props: TransformProps) {
    super(node, props);
    this._init(node, props);
  }

  public cloneTo(target: Transform): Transform {
    target._position;
    return target;
  }

  /**
   * 获取子变换
   */
  //CM:修改为getChild
  getChildTransform(index: number): Transform {
    return this._children[index];
  }

  /**
   * 获取世界矩阵的前向量。
   * @param forward - 前向量
   */
  getWorldForward(forward: vec3Type): vec3Type {
    forward = vec3.set(forward, this._worldMatrix[8], this._worldMatrix[9], this._worldMatrix[10]);
    return vec3.normalize(forward, forward);
  }

  /**
   * 获取世界矩阵的右向量。
   * @param right - 右向量
   */
  getWorldRight(right: vec3Type): vec3Type {
    right = vec3.set(right, this._worldMatrix[0], this._worldMatrix[1], this._worldMatrix[2]);
    return vec3.normalize(right, right);
  }

  /**
   * 获取世界矩阵的上向量。
   * @param up - 上向量
   */
  getWorldUp(up: vec3Type): vec3Type {
    up = vec3.set(up, this._worldMatrix[4], this._worldMatrix[5], this._worldMatrix[6]);
    return vec3.normalize(up, up);
  }

  /**
   * 在指定的方向和距离上位移
   * @param translation - 位移的方向和距离
   * @param relativeToLocal - 是否相对局部空间
   */
  translate(translation: vec3Type, relativeToLocal: boolean = true): void {
    if (relativeToLocal) {
      mat4.fromQuat(Transform._tempMat4, this.rotationQuaternion);
      translation = vec3.transformMat4(Transform._tempVec3, translation, Transform._tempMat4);
      this.position = vec3.add(this._position, this._position, translation);
    } else {
      vec3.add(this.worldPosition, translation, this._worldPosition);
    }
  }

  /**
   * 根据指定欧拉角旋转。
   * @param rotation - 旋转角度，欧拉角表达，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotate(rotation: vec3Type, relativeToLocal: boolean = true): void {
    const rotationQuat = quat.fromEuler(Transform._tempVec4, rotation[0], rotation[1], rotation[2]);
    if (relativeToLocal) {
      quat.multiply(this._rotationQuaternion, this._rotationQuaternion, rotationQuat);
      this.rotationQuaternion = this._rotationQuaternion;
    } else {
      quat.multiply(this._worldRotationQuaternion, this._worldRotationQuaternion, rotationQuat);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
    }
  }

  /**
   * 根据指定角度围绕指定轴进行旋转。
   * @param axis - 旋转轴
   * @param angle - 旋转角度，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateAxis(axis: vec3Type, angle: number, relativeToLocal: boolean = true): void {
    const rad = (angle * Math.PI) / 180;
    const rotateQuat = quat.setAxisAngle(Transform._tempVec4, axis, rad);
    if (relativeToLocal) {
      quat.multiply(this._rotationQuaternion, this._rotationQuaternion, rotateQuat);
      this.rotationQuaternion = this._rotationQuaternion;
    } else {
      quat.multiply(this._worldRotationQuaternion, this._worldRotationQuaternion, rotateQuat);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
    }
  }

  /**
   * 旋转并且保证世界前向量指向目标世界位置。
   * @param worldPosition - 目标世界位置
   * @param worldUp - 世界上向量
   */
  lookAt(worldPosition: vec3Type, worldUp: vec3Type): void {
    const position = this.worldPosition;
    const modelMatrix = mat4.lookAtR(Transform._tempMat43, position, worldPosition, worldUp);
    this.worldMatrix = modelMatrix;
  }

  private _init(node, props) {
    this._initDirtyFlag();
    this._initTRS(props);
    this._getParent(node);
    this._getChild(node, this._children);
  }

  private _initDirtyFlag() {
    this._setDirtyFlag(Transform._LOCAL_EULER_FLAG | Transform._LOCAL_QUAT_FLAG | Transform._LOCAL_MATRIX_FLAG, false);
    this._setDirtyFlag(
      Transform._WORLD_POSITION_FLAG |
        Transform._WORLD_EULER_FLAG |
        Transform._WORLD_QUAT_FLAG |
        Transform._WORLD_SCALE_FLAG |
        Transform._WORLD_MATRIX_FLAG,
      true
    );
  }

  private _initTRS(props) {
    if (!props) return;
    const { scale, position, rotation, rotationQuaternion } = props;
    if (position) {
      this.position = position;
    }
    if (rotation) {
      this.rotation = rotation;
    }
    if (rotationQuaternion) {
      this.rotationQuaternion = rotationQuaternion;
    }
    if (scale) {
      this.scale = scale;
    }
  }

  private _getParent(node): Transform {
    let parent = node.parentNode;
    let parentTransform = null;
    while (parent) {
      const transformAility = parent.transform;
      if (transformAility) {
        parentTransform = transformAility;
        break;
      } else {
        parent = parent.parentNode;
      }
    }
    this._parent = parentTransform;
    if (this._parent) {
      this._parent._children.push(this);
    }
    return parentTransform;
  }

  /**
   * 初始化子变换数量
   */
  private _getChild(node, children) {
    if (node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        const childNode = node.children[i];
        if (childNode && childNode.transform) {
          children.push(childNode.transform);
        }
      }
    }
  }

  /**
   * 获取worldMatrix：会触发自身以及所有父节点的worldMatrix更新
   * 获取worldPosition：会触发自身position和自身worldMatrix以及所有父节点的worldMatrix更新
   * 综上所描：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix）的脏标记为false
   */
  private _updateWorldPositionFlag(): void {
    if (!this._getDirtyFlag(Transform._WM_WP_FLAG)) {
      this._setDirtyFlag(Transform._WM_WP_FLAG, true);
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionFlag();
      }
    }
  }

  /**
   * 获取worldMatrix：会触发自身以及所有父节点的worldMatrix更新
   * 获取worldPosition：会触发自身position和自身worldMatrix以及所有父节点的worldMatrix更新
   * 获取worldRotationQuaternion：会触发自身以及所有父节点的worldRotationQuaternion更新
   * 获取worldRotation：会触发自身worldRotation和自身worldRotationQuaternion以及所有父节点的worldRotationQuaternion更新
   * 综上所描：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix或orldRotationQuaternion）的脏标记为false
   */
  private _updateWorldRotationFlag() {
    if (!this._getDirtyFlag(Transform._WM_WE_WQ_FLAG)) {
      this._setDirtyFlag(Transform._WM_WE_WQ_FLAG, true);
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndRotationFlag(); //父节点旋转发生变化，子节点的世界位置和旋转都需要更新
      }
    }
  }

  /**
   * 获取worldMatrix：会触发自身以及所有父节点的worldMatrix更新
   * 获取worldPosition：会触发自身position和自身worldMatrix以及所有父节点的worldMatrix更新
   * 获取worldRotationQuaternion：会触发自身以及所有父节点的worldRotationQuaternion更新
   * 获取worldRotation：会触发自身worldRotation和自身worldRotationQuaternion以及所有父节点的worldRotationQuaternion更新
   * 综上所描：任何一个相关变量更新都会造成其中一条完成链路（worldMatrix或orldRotationQuaternion）的脏标记为false
   */
  private _updateWorldPositionAndRotationFlag() {
    if (!this._getDirtyFlag(Transform._WM_WP_WE_WQ_FLAG)) {
      this._setDirtyFlag(Transform._WM_WP_WE_WQ_FLAG, true);
    }
    for (var i: number = 0, n: number = this._children.length; i < n; i++) {
      this._children[i]._updateWorldPositionAndRotationFlag();
    }
  }

  private _updateWorldScale() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform._WORLD_MATRIX_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform._WORLD_SCALE_FLAG);
    if (!worldMatrixNeedUpdate || !worldScaleNeedUpdate) {
      this._setDirtyFlag(Transform._WORLD_MATRIX_FLAG | Transform._WORLD_SCALE_FLAG, false);
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndScale();
      }
    }
  }

  private _updateWorldPositionAndScale() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform._WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform._WORLD_POSITION_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform._WORLD_SCALE_FLAG);
    if (!worldMatrixNeedUpdate || !worldPositionNeedUpdate || !worldScaleNeedUpdate) {
      this._setDirtyFlag(
        Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_SCALE_FLAG,
        true
      );
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndScale();
      }
    }
  }

  private _getScaleMatrix(): mat3Type {
    const invRotation = Transform._tempVec4;
    const invRotationMat = Transform._tempMat3;
    const worldRotScaMat = Transform._tempMat31;
    let scaMat = Transform._tempMat32;
    mat3.fromMat4(worldRotScaMat, this.worldMatrix);
    quat.invert(invRotation, this.worldRotationQuaternion);
    mat3.fromQuat(invRotation, invRotationMat);
    mat3.multiply(scaMat, invRotationMat, worldRotScaMat);
    return scaMat;
  }

  private _updateAll() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform._WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform._WORLD_POSITION_FLAG);
    const worldRotationNeedUpdate = this._getDirtyFlag(Transform._WORLD_EULER_FLAG);
    const worldRotationQuatNeedUpdate = this._getDirtyFlag(Transform._WORLD_QUAT_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform._WORLD_SCALE_FLAG);
    if (
      !worldMatrixNeedUpdate ||
      !worldPositionNeedUpdate ||
      !worldRotationNeedUpdate ||
      !worldRotationQuatNeedUpdate ||
      !worldScaleNeedUpdate
    ) {
      this._setDirtyFlag(
        Transform._WORLD_MATRIX_FLAG |
          Transform._WORLD_POSITION_FLAG |
          Transform._WORLD_EULER_FLAG |
          Transform._WORLD_QUAT_FLAG |
          Transform._WORLD_SCALE_FLAG,
        true
      );
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateAll();
      }
    }
  }

  /**
   * 获取脏标记
   */
  private _getDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlag(type: number, value: boolean): void {
    if (value) {
      this._dirtyFlag |= type;
    } else {
      this._dirtyFlag &= ~type;
    }
  }

  //---------------------@deprecated-----------------------
  updateParentTransform() {
    this._getParent(this.node);
    this._updateAll();
  }
}
