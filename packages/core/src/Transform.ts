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

export class Transform extends NodeAbility {
  // Statics
  // temp
  static _tempVec3: vec3Type = vec3.create();
  static _tempVec4: vec4Type = vec4.create();
  static _tempMat3: mat3Type = mat3.create();
  static _tempMat4: mat4Type = mat4.create();

  static _tempVec31: vec3Type = vec3.create();
  static _tempVec41: vec4Type = vec4.create();
  static _tempMat31: mat3Type = mat3.create();
  static _tempMat41: mat4Type = mat4.create();

  static _tempVec32: vec3Type = vec3.create();
  static _tempVec42: vec4Type = vec4.create();
  static _tempMat32: mat3Type = mat3.create();
  static _tempMat42: mat4Type = mat4.create();

  // dirty flag
  static LOCAL_POSITION_FLAG: number = 0x1;
  static LOCAL_ROTATION_FLAG: number = 0x2;
  static LOCAL_ROTATION_QUAT_FLAG: number = 0x4;
  static LOCAL_SCALE_FLAG: number = 0x8;

  static WORLD_POSITION_FLAG: number = 0x10;
  static WORLD_ROTATION_FLAG: number = 0x20;
  static WORLD_ROTATION_QUAT_FLAG: number = 0x40;
  static WORLD_SCALE_FLAG: number = 0x80;

  static LOCAL_MATRIX_FLAG: number = 0x100;
  static WORLD_MATRIX_FLAG: number = 0x200;

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

  private _parent = null;
  private _children: Transform[] = [];
  private _dirtyFlag: number = 0;

  constructor(node: Node, props: TransformProps) {
    super(node, props);
    this._init(node, props);
  }

  private _init(node, props) {
    this._initDirtyFlag();
    this._initTRS(props);
    this._getParent(node);
    this._getChild(node, this._children);
    console.log(this.node.name);
    node.transform = this;
  }

  private _initDirtyFlag() {
    this._setDirtyFlag(
      Transform.LOCAL_POSITION_FLAG |
        Transform.LOCAL_ROTATION_FLAG |
        Transform.LOCAL_ROTATION_QUAT_FLAG |
        Transform.LOCAL_SCALE_FLAG |
        Transform.LOCAL_MATRIX_FLAG,
      false
    );
    this._setDirtyFlag(
      Transform.WORLD_POSITION_FLAG |
        Transform.WORLD_ROTATION_FLAG |
        Transform.WORLD_ROTATION_QUAT_FLAG |
        Transform.WORLD_SCALE_FLAG |
        Transform.WORLD_MATRIX_FLAG,
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

  /**
   * 父变换
   */
  get parentTransform(): Transform {
    return this._parent;
  }
  set parentTransform(value: Transform) {
    this._parent = value;
    this._parent._childCount++;
    this._parent._children.push(this);
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
    return parentTransform;
  }

  /**
   * 子变换数量
   */
  get childTransformCount(): number {
    return this._children.length;
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
   * 获取子变换
   */
  getChildTransform(index: number): Transform {
    return this._children[index];
  }

  /**
   * 局部位置
   */
  get position(): vec3Type {
    // localMatrix -> position
    if (this._getDirtyFlag(Transform.LOCAL_POSITION_FLAG)) {
      mat4.getTranslation(this._position, this._localMatrix);
      this._setDirtyFlag(Transform.LOCAL_POSITION_FLAG, false);
    }
    return this._position;
  }

  set position(value: vec3Type) {
    if (!vec3.equals(this._position, value)) {
      vec3.copy(this._position, value);
      this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG, true);
      // 局部位移变化，需要更新世界矩阵和世界位移⬇️
      this._updateWorldPosition();
    }
  }

  private _updateWorldPosition(): void {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform.WORLD_POSITION_FLAG);
    if (!worldMatrixNeedUpdate || !worldPositionNeedUpdate) {
      this._setDirtyFlag(Transform.WORLD_MATRIX_FLAG | Transform.WORLD_POSITION_FLAG, true);
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPosition();
      }
    }
  }

  /**
   * 世界位置
   */
  get worldPosition(): vec3Type {
    // worldMatrix -> worldPosition
    if (this._getDirtyFlag(Transform.WORLD_POSITION_FLAG)) {
      if (this._parent) {
        mat4.getTranslation(this._worldPosition, this.worldMatrix);
      } else {
        vec3.copy(this._worldPosition, this.position);
      }
      this._setDirtyFlag(Transform.WORLD_POSITION_FLAG, false);
    }
    return this._worldPosition;
  }

  set worldPosition(value: vec3Type) {
    if (!vec3.equals(this._worldPosition, value)) {
      vec3.copy(this._worldPosition, value);
      if (this._parent) {
        const matWorldToLocal = mat4.invert(Transform._tempMat4, this._parent.worldMatrix);
        vec3.transformMat4(this._position, value, matWorldToLocal);
      } else {
        vec3.copy(this._position, value);
      }
      this.position = this._position;
      this._setDirtyFlag(Transform.WORLD_POSITION_FLAG, false);
    }
  }

  /**
   * 局部旋转，欧拉角表达,单位是角度制
   */
  get rotation(): vec3Type {
    // rotationQuat -> rotation
    // localMatrix -> rotation
    if (this._getDirtyFlag(Transform.LOCAL_ROTATION_FLAG)) {
      if (!this._getDirtyFlag(Transform.LOCAL_ROTATION_QUAT_FLAG) || this._getDirtyFlag(Transform.LOCAL_MATRIX_FLAG)) {
        // 若local quat已更新，local matrix未更新，用local quat计算
        quat.toEuler(this._rotation, this._rotationQuaternion);
      } else {
        // 否则用local matrix计算
        const rotationQuat = mat4.getRotation(Transform._tempVec4, this._localMatrix);
        quat.toEuler(this._rotation, rotationQuat);
      }
      this._setDirtyFlag(Transform.LOCAL_ROTATION_FLAG, false);
    }
    return this._rotation;
  }

  set rotation(value: vec3Type) {
    if (!vec3.equals(this.rotate, value)) {
      vec3.copy(this._rotation, value);
      this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG | Transform.LOCAL_ROTATION_QUAT_FLAG, true);
      this._setDirtyFlag(Transform.LOCAL_ROTATION_FLAG, false);
      this._updateWorldRotation();
    }
  }

  private _updateWorldRotation() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldRotationNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_FLAG);
    const worldRotationQuatNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG);
    if (!worldMatrixNeedUpdate || !worldRotationNeedUpdate || !worldRotationQuatNeedUpdate) {
      this._setDirtyFlag(
        Transform.WORLD_MATRIX_FLAG | Transform.WORLD_ROTATION_FLAG | Transform.WORLD_ROTATION_QUAT_FLAG,
        true
      );
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndRotation();
      }
    }
  }

  private _updateWorldPositionAndRotation() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform.WORLD_POSITION_FLAG);
    const worldRotationNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_FLAG);
    const worldRotationQuatNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG);
    if (
      !worldMatrixNeedUpdate ||
      !worldPositionNeedUpdate ||
      !worldRotationNeedUpdate ||
      !worldRotationQuatNeedUpdate
    ) {
      this._setDirtyFlag(
        Transform.WORLD_MATRIX_FLAG |
          Transform.WORLD_POSITION_FLAG |
          Transform.WORLD_ROTATION_FLAG |
          Transform.WORLD_ROTATION_QUAT_FLAG,
        true
      );
    }
    for (var i: number = 0, n: number = this._children.length; i < n; i++) {
      this._children[i]._updateWorldPositionAndRotation();
    }
  }

  /**
   * 世界旋转，欧拉角表达,单位是角度制
   */
  get worldRotation(): vec3Type {
    // worldMatrix -> worldRotation
    // worldRotationQuaternion -> worldRotation
    if (this._getDirtyFlag(Transform.WORLD_ROTATION_FLAG)) {
      if (!this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG) && this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG)) {
        // 若world quat已更新，world matrix未更新，用world quat计算
        quat.toEuler(this._worldRotation, this._worldRotationQuaternion);
      } else {
        // 否则用world matrix计算
        const worldQuat = mat4.getRotation(Transform._tempVec4, this._worldMatrix);
        quat.toEuler(this._worldRotation, worldQuat);
      }
      this._setDirtyFlag(Transform.WORLD_ROTATION_FLAG, false);
    }
    return this._worldRotation;
  }

  set worldRotation(value: vec3Type) {
    if (!vec3.equals(this._worldRotation, value)) {
      vec3.copy(this._worldRotation, value);
      quat.fromEuler(this._worldRotationQuaternion, value[0], value[1], value[2]);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
      this._setDirtyFlag(Transform.WORLD_ROTATION_FLAG, false);
    }
  }

  /**
   * 局部旋转，四元数表达
   */
  get rotationQuaternion(): vec4Type {
    // rotation -> rotationQuaternion
    // localMatrix -> rotationQuaternion
    if (this._getDirtyFlag(Transform.LOCAL_ROTATION_QUAT_FLAG)) {
      if (!this._getDirtyFlag(Transform.LOCAL_ROTATION_FLAG) && this._getDirtyFlag(Transform.LOCAL_MATRIX_FLAG)) {
        // 若local rotation 更新了， local matrix未更新，用local rotation计算
        quat.fromEuler(this._rotationQuaternion, this._rotation[0], this._rotation[1], this._rotation[2]);
      } else {
        // 否则，用local matrix计算
        mat4.getRotation(this._rotationQuaternion, this._localMatrix);
      }
      this._setDirtyFlag(Transform.LOCAL_ROTATION_QUAT_FLAG, false);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: vec4Type) {
    if (!quat.equals(this._rotationQuaternion, value)) {
      quat.copy(this._rotationQuaternion, value);
      this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG | Transform.LOCAL_ROTATION_FLAG, true);
      this._setDirtyFlag(Transform.LOCAL_ROTATION_QUAT_FLAG, false);
      this._updateWorldRotation();
    }
  }

  /**
   *世界旋转，四元数表达
   */
  get worldRotationQuaternion(): vec4Type {
    // worldRotation -> worldRotationQuaternion
    // worldMatrix -> worldRotationQuaternion
    if (this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG)) {
      if (!this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG) && this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG)) {
        // world matrix未更新，worldRotation已更新，用worldRotation计算
        quat.fromEuler(
          this._worldRotationQuaternion,
          this._worldRotation[0],
          this._worldRotation[1],
          this._worldRotation[2]
        );
      } else {
        // 否则用worldMatrix 计算
        mat4.getRotation(this._worldRotationQuaternion, this._worldMatrix);
      }
      this._setDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG, false);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: vec4Type) {
    if (!quat.equals(this._worldRotationQuaternion, value)) {
      quat.copy(this._worldRotationQuaternion, value);
      if (this._parent) {
        const quatWorldToLocal = mat4.invert(Transform._tempMat4, this._parent.worldRotationQuaternion);
        quat.multiply(this._rotationQuaternion, value, quatWorldToLocal);
      } else {
        quat.copy(this._rotationQuaternion, value);
      }
      this.rotationQuaternion = this._rotationQuaternion;
      this._setDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG, false);
    }
  }

  /**
   * 局部缩放
   */
  get scale(): vec3Type {
    // localMatrix -> scale
    if (this._getDirtyFlag(Transform.LOCAL_SCALE_FLAG)) {
      mat4.getScaling(this._scale, this._localMatrix);
    }
    return this._scale;
  }

  set scale(value: vec3Type) {
    if (!vec3.equals(this._scale, value)) {
      vec3.copy(this._scale, value);
      this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG, true);
      this._updateWorldScale();
    }
  }

  private _updateWorldScale() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform.WORLD_SCALE_FLAG);
    if (worldMatrixNeedUpdate || worldScaleNeedUpdate) {
      this._setDirtyFlag(Transform.WORLD_MATRIX_FLAG | Transform.WORLD_SCALE_FLAG, false);
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndScale();
      }
    }
  }

  private _updateWorldPositionAndScale() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform.WORLD_POSITION_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform.WORLD_SCALE_FLAG);
    if (worldMatrixNeedUpdate || worldPositionNeedUpdate || worldScaleNeedUpdate) {
      this._setDirtyFlag(
        Transform.WORLD_MATRIX_FLAG | Transform.WORLD_POSITION_FLAG | Transform.WORLD_SCALE_FLAG,
        true
      );
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateWorldPositionAndScale();
      }
    }
  }

  /**
   * 世界缩放
   */
  get lossyWorldScale(): vec3Type {
    if (this._getDirtyFlag(Transform.WORLD_SCALE_FLAG)) {
      if (this._parent) {
        const scaleMat = this._getScaleMatrix();
        this._lossyWorldScale = [scaleMat[0], scaleMat[4], scaleMat[8]];
      } else {
        this._lossyWorldScale = this._scale;
      }
      this._setDirtyFlag(Transform.WORLD_SCALE_FLAG, false);
    }
    return this._lossyWorldScale;
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

  /**
   * 局部矩阵
   */
  get localMatrix(): mat4Type {
    if (this._getDirtyFlag(Transform.LOCAL_MATRIX_FLAG)) {
      mat4.fromRotationTranslationScale(this._localMatrix, this.rotationQuaternion, this.position, this.scale);
    }
    this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG, false);
    return this._localMatrix;
  }

  set localMatrix(value: mat4Type) {
    if (!mat4.equals(this._localMatrix, value)) {
      mat4.copy(this._localMatrix, value);
      this._setDirtyFlag(
        Transform.LOCAL_POSITION_FLAG |
          Transform.LOCAL_ROTATION_FLAG |
          Transform.LOCAL_ROTATION_QUAT_FLAG |
          Transform.LOCAL_SCALE_FLAG,
        true
      );
      this._setDirtyFlag(Transform.LOCAL_MATRIX_FLAG, false);
      this._updateAll();
    }
  }

  private _updateAll() {
    const worldMatrixNeedUpdate = this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG);
    const worldPositionNeedUpdate = this._getDirtyFlag(Transform.WORLD_POSITION_FLAG);
    const worldRotationNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_FLAG);
    const worldRotationQuatNeedUpdate = this._getDirtyFlag(Transform.WORLD_ROTATION_QUAT_FLAG);
    const worldScaleNeedUpdate = this._getDirtyFlag(Transform.WORLD_SCALE_FLAG);
    if (
      worldMatrixNeedUpdate ||
      worldPositionNeedUpdate ||
      worldRotationNeedUpdate ||
      worldRotationQuatNeedUpdate ||
      worldScaleNeedUpdate
    ) {
      this._setDirtyFlag(
        Transform.WORLD_MATRIX_FLAG |
          Transform.WORLD_POSITION_FLAG |
          Transform.WORLD_ROTATION_FLAG |
          Transform.WORLD_ROTATION_QUAT_FLAG |
          Transform.WORLD_SCALE_FLAG,
        true
      );
      for (var i: number = 0, n: number = this._children.length; i < n; i++) {
        this._children[i]._updateAll();
      }
    }
  }

  /**
   * 世界矩阵
   */
  get worldMatrix(): mat4Type {
    if (this._getDirtyFlag(Transform.WORLD_MATRIX_FLAG)) {
      if (this._parent) {
        mat4.multiply(this._worldMatrix, this._parent.worldMatrix, this.localMatrix);
      } else {
        this._worldMatrix = this.localMatrix;
      }
      this._setDirtyFlag(Transform.WORLD_MATRIX_FLAG, false);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: mat4Type) {
    if (!mat4.equals(this._worldMatrix, value)) {
      mat4.copy(this._worldMatrix, value);
      if (this._parent) {
        const matWorldToLocal = mat4.invert(Transform._tempMat4, this._parent.worldMatrix);
        mat4.multiply(this._localMatrix, value, matWorldToLocal);
      } else {
        mat4.copy(this._localMatrix, value);
      }
      this.localMatrix = this._localMatrix;
      this._setDirtyFlag(Transform.WORLD_MATRIX_FLAG, false);
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
   * 设置世界矩阵的前向量。
   * @param forward - 前向量
   */
  setWorldForward(forward: vec3Type): vec3Type {
    return;
  }

  /**
   * 设置世界矩阵的右向量。
   * @param right - 右向量
   */
  setWorldRight(right: vec3Type): vec3Type {
    return;
  }

  /**
   * 设置世界矩阵的上向量。
   * @param up - 上向量
   */
  setWorldUp(up: vec3Type): vec3Type {
    return;
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
      quat.multiply(rotationQuat, this.worldRotationQuaternion, this._worldRotationQuaternion);
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
    const modelMatrix = mat4.lookAtR(Transform._tempMat4, position, worldPosition, worldUp);
    this.worldMatrix = modelMatrix;
  }
}
