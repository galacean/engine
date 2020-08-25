import { ASphereCollider } from "./ASphereCollider";
import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";

export class SphereCollider extends ASphereCollider {
  private __center: Vector3 = new Vector3();
  private __radius: number = 1.0;
  private isShowCollider: boolean = true;

  constructor(entity: Entity, props?: any) {
    super(entity, props);

    const { _center, _radius, isShowCollider } = props;

    this._center = _center;
    this._radius = _radius;
    this.isShowCollider = isShowCollider;
  }

  get _center(): Vector3 {
    return this.__center;
  }

  set _center(value: Vector3) {
    this.__center = value;
    this.setSphere(this.__center, this.__radius);
  }

  get _radius() {
    return this.__radius;
  }

  set _radius(value: number) {
    this.__radius = value;
    this.setSphere(this.__center, this.__radius);
  }
}
