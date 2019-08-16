import { Node } from "./Node";
import { quat, vec3 } from "@alipay/r3-math"

abstract class BasePoint {
  constructor(protected node: Node) {
  }

  abstract get x(): number;
  abstract set x(value: number);

  abstract get y(): number;
  abstract set y(value: number);

  abstract get z(): number;
  abstract set z(value: number);
}

class PositionPoint extends BasePoint {
  get x(): number {
    return this.node.position[0];
  }
  set x(value: number) {
    this.node.position[0] = value;
    this.node._markTransformDirty();
  }

  get y(): number {
    return this.node.position[1];
  }
  set y(value: number) {
    this.node.position[1] = value;
    this.node._markTransformDirty();
  }

  get z(): number {
    return this.node.position[2];
  }
  set z(value: number) {
    this.node.position[2] = value;
    this.node._markTransformDirty();
  }
}

class ScalePoint extends BasePoint {
  get x(): number {
    return this.node.scale[0];
  }
  set x(value: number) {
    this.node.scale[0] = value;
    this.node._markTransformDirty();
  }

  get y(): number {
    return this.node.scale[1];
  }
  set y(value: number) {
    this.node.scale[1] = value;
    this.node._markTransformDirty();
  }

  get z(): number {
    return this.node.scale[2];
  }
  set z(value: number) {
    this.node.scale[2] = value;
    this.node._markTransformDirty();
  }
}

class RotationPoint extends BasePoint {
  /**
   * @deprecated
   */
  get x(): number {
    const e = vec3.create();
    quat.toEuler(e, this.node.rotation);
    return e[0];
  }

  set x(value: number) {
    this.node.setRotationAxisAngle([1, 0, 0], value);
  }

  /**
   * @deprecated
   */
  get y(): number {
    const e = vec3.create();
    quat.toEuler(e, this.node.rotation);
    return e[1];
  }

  set y(value: number) {
    this.node.setRotationAxisAngle([0, 1, 0], value);
  }

  /**
   * @deprecated
   */
  get z(): number {
    const euler = vec3.create();
    quat.toEuler(euler, this.node.rotation);
    return euler[2];
  }

  set z(value: number) {
    this.node.setRotationAxisAngle([0, 0, 1], value);
  }
}

export class Transform {
  private _position: PositionPoint;
  private _rotation: RotationPoint;
  private _scale: ScalePoint;
  constructor(node: Node) {
    this._position = new PositionPoint(node);
    this._rotation = new RotationPoint(node);
    this._scale = new ScalePoint(node);
  }

  public get position(): PositionPoint {
    return this._position;
  }

  public get rotation(): RotationPoint {
    return this._rotation;
  }

  public get scale(): ScalePoint {
    return this._scale;
  }
}
