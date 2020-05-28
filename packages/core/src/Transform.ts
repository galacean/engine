import { vec3 } from "@alipay/o3-math";
import { Node } from "./Node";
import { NodeAbility } from "./NodeAbility";
import { vec3Type, vec4Type, mat4Type } from "./type";

type TransformProps = {
  scale?: vec3Type;
  position?: vec3Type;
  rotation?: vec3Type;
  rotationQuaternion?: vec4Type;
};

const _forward = vec3.create();
const _rignt = vec3.create();
const _up = vec3.create();

export class Transform extends NodeAbility {
  // Statics
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
  private _position: vec3Type;
  private _rotation: vec3Type;
  private _rotationQuaternion: vec4Type;
  private _scale: vec3Type;

  private _worldPosition: vec3Type;
  private _worldRotation: vec3Type;
  private _worldRotationQuaternion: vec4Type;
  private _lossyWorldScale: vec3Type;

  private _localMatrix: mat4Type;
  private _worldMatrix: mat4Type;

  private _dirtyFlag: number = 0;

  constructor(node: Node, props: TransformProps) {
    super(node, props);
    this._initDirtyFlag();
    const { scale = [1, 1, 1], position = [0, 0, 0], rotation = [0, 0, 0], rotationQuaternion = [0, 0, 0, 1] } = props;
    this.position = position;
    this.rotation = rotation;
    this.rotationQuaternion = rotationQuaternion;
    this.scale = scale;
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

  /**
   * 父变换
   */
  get parentTransform(): Transform {
    return;
  }
  set parentTransform(value: Transform) {
    return;
  }

  /**
   * 子变换数量
   */
  get childTransformCount(): number {
    return;
  }

  /**
   * 局部位置
   */
  public get position(): vec3Type {
    const positionChange = this._getDirtyFlag();
    return this._position;
  }

  public set position(value: vec3Type) {
    this._position = value;
  }

  /**
   * 世界位置
   */
  public get worldPosition(): vec3Type {
    return this._worldPosition;
  }

  public set worldPosition(value: vec3Type) {
    this._worldPosition = value;
  }

  /**
   * 局部缩放
   */
  public get scale(): vec3Type {
    return this._scale;
  }

  public set scale(value: vec3Type) {
    this._scale = value;
  }

  /**
   * 世界缩放
   */
  get lossyWorldScale(): vec3Type {
    return;
  }

  /**
   * 局部旋转，欧拉角表达,单位是角度制
   */
  public get rotation(): vec3Type {
    return this._rotation;
  }

  public set rotation(value: vec3Type) {
    this._rotation = value;
    this._rotationQuaternion = null;
  }

  /**
   * 世界旋转，欧拉角表达,单位是角度制
   */
  public get worldRotation(): vec3Type {
    return this._worldRotation;
  }

  public set worldRotation(value: vec3Type) {
    this._worldRotation = value;
    this._worldRotationQuaternion = null;
  }

  /**
   * 局部旋转，四元数表达
   */
  public get rotationQuaternion(): vec4Type {
    return this._rotationQuaternion;
  }

  public set rotationQuaternion(value: vec4Type) {
    this._rotationQuaternion = value;
    if (value) {
      this._rotation = [0, 0, 0];
    }
  }

  /**
   *世界旋转，四元数表达
   */
  public get worldRotationQuaternion(): vec4Type {
    return this._worldRotationQuaternion;
  }

  public set worldRotationQuaternion(value: vec4Type) {
    this._worldRotationQuaternion = value;
    if (value) {
      this._worldRotation = [0, 0, 0];
    }
  }

  /**
   * 局部矩阵
   */
  get localMatrix(): mat4Type {
    return this._localMatrix;
  }
  set localMatrix(value: mat4Type) {}

  /**
   * 世界矩阵
   */
  get worldMatrix(): mat4Type {
    return this._worldMatrix;
  }
  set worldMatrix(value: mat4Type) {}

  /**
   * 获取脏标记
   */
  _getDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  _setDirtyFlag(type: number, value: boolean): void {
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
  public getWorldForward(forward: vec3Type): vec3Type {
    return;
  }

  /**
   * 设置世界矩阵的前向量。
   * @param forward - 前向量
   */
  public setWorldForward(forward: vec3Type): void {}

  /**
   * 获取世界矩阵的右向量。
   * @param right - 右向量
   */
  getWorldRight(right: vec3Type): vec3Type {
    return;
  }

  /**
   * 设置世界矩阵的右向量。
   * @param right - 右向量
   */
  setWorldRight(right: vec3Type): void {}

  /**
   * 获取世界矩阵的上向量。
   * @param up - 上向量
   */
  getWorldUp(up: vec3Type): vec3Type {
    return;
  }

  /**
   * 设置世界矩阵的上向量。
   * @param up - 上向量
   */
  setWorldUp(up: vec3Type): void {}

  /**
   * 在指定的方向和距离上位移。
   * @param translation - 位移的方向和距离
   * @param relativeToLocal - 是否相对局部空间
   */
  translate(translation: vec3Type, relativeToLocal: boolean = true): void {}

  /**
   * 根据指定欧拉角旋转。
   * @param rotation - 旋转角度，欧拉角表达，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotate(rotation: vec3Type, relativeToLocal: boolean = true): void {}

  /**
   * 根据指定角度围绕指定轴进行旋转。
   * @param axis - 旋转轴
   * @param angle - 旋转角度，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateAxis(axis: vec3Type, angle: number, relativeToLocal: boolean = true): void {}

  /**
   * 旋转并且保证世界前向量指向目标世界位置。
   * @param worldPosition - 目标世界位置
   * @param worldUp - 世界上向量
   */
  lookAt(worldPosition: vec3Type, worldUp: vec3Type): void {}
}
