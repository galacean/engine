import { NodeAbility } from "../NodeAbility";

/**
 * 变换组件，用于变换相关的操作和层级的子父关联。
 */
export class Transform extends NodeAbility {
  /**
   * @todo 由于父类命名冲突，暂时命名为transformParent，待引擎整理后调整为parent
   * 父变换。
   */
  get transformParent(): Transform {
    return null;
  }

  /**
   * 子变换数量。
   */
  get childCount(): number {
    return 0;
  }

  /**
   * 局部位置。
   */
  get position(): Vector3 {
    return null;
  }
  set position(value: Vector3) {}

  /**
   * 局部旋转，欧拉角表达,单位是角度制。
   */
  get rotation(): Vector3 {
    return null;
  }
  set rotation(value: Vector3) {}

  /**
   * 局部缩放。
   */
  get scale(): Vector3 {
    return null;
  }
  set scale(value: Vector3) {}

  /**
   * 局部旋转，四元数表达。
   */
  get rotationQuaternion(): Quaternion {
    return null;
  }
  set rotationQuaternion(value: Quaternion) {}

  /**
   * 局部矩阵。
   */
  get localMatrix(): Matrix {
    return null;
  }
  set localMatrix(value) {}

  /**
   * 世界位置。
   */
  get worldPosition(): Vector3 {
    return null;
  }
  set worldPosition(value: Vector3) {}

  /**
   * 世界旋转，欧拉角表达,,单位是角度制。
   */
  get worldRotation(): Vector3 {
    return null;
  }
  set worldRotation(value: Vector3) {}

  /**
   * 世界缩放。
   * 某种条件下获取该值可能不正确（例如：父节点有缩放，子节点有旋转），缩放会倾斜，无法使用Vector3正确表示,必须使用Matrix3x3矩阵才能正确表示。
   */
  get lossyWorldScale(): Vector3 {
    return null;
  }

  /**
   * 世界旋转，四元数表达。
   */
  get worldRotationQuaternion(): Quaternion {
    return null;
  }
  set worldRotationQuaternion(value: Quaternion) {}

  /**
   * 世界矩阵。
   */
  get worldMatrix(): Matrix {
    return null;
  }
  set worldMatrix(value: Matrix) {}

  /**
   * 通过索引获取子变换。
   * @param index - 索引
   */
  getChild(index: number): void {}

  /**
   * 获取世界矩阵的前向量。
   * @param forward - 前向量
   */
  getWorldForward(forward: Vector3): void {}

  /**
   * 设置世界矩阵的前向量。
   * @param forward - 前向量
   */
  setWorldForward(forward: Vector3): void {}

  /**
   * 获取世界矩阵的右向量。
   * @param right - 右向量
   */
  getWorldRight(right: Vector3): void {}

  /**
   * 设置世界矩阵的右向量。
   * @param right - 右向量
   */
  setWorldRight(right: Vector3): void {}

  /**
   * 获取世界矩阵的上向量。
   * @param up - 上向量
   */
  getWorldUp(up: Vector3): void {}

  /**
   * 设置世界矩阵的上向量。
   * @param up - 上向量
   */
  setWorldUp(up: Vector3): void {}

  /**
   * 在指定的方向和距离上位移。
   * @param translation - 位移的方向和距离
   * @param relativeToLocal - 是否相对局部空间
   */
  translate(translation: Vector3, relativeToLocal: boolean = true): void {}

  /**
   * 根据指定欧拉角旋转。
   * @param rotation - 旋转角度，欧拉角表达，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotate(rotation: Vector3, relativeToLocal: boolean = true): void {}

  /**
   * 根据指定角度围绕指定轴进行旋转。
   * @param axis - 旋转轴
   * @param angle - 旋转角度，单位是角度制
   * @param relativeToLocal - 是否相对局部空间
   */
  rotateAxis(axis: Vector3, angle: number, relativeToLocal: boolean = true): void {}

  /**
   * 旋转并且保证世界前向量指向目标世界位置。
   * @param worldPosition - 目标世界位置
   * @param worldUp - 世界上向量
   */
  lookAt(worldPosition: Vector3, worldUp: Vector3): void {}
}

//-------------------------------------------------------------Temp Type Convert--------------------------------------------------------
type Vector3 = number[];
type Quaternion = number[];
type Matrix = number[];
