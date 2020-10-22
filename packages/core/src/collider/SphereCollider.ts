import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";
import { ASphereCollider } from "./ASphereCollider";

export class SphereCollider extends ASphereCollider {
  private __center: Vector3 = new Vector3();
  private __radius: number = 1.0;
  private isShowCollider: boolean = true;

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

  constructor(entity: Entity) {
    super(entity);

    this._center = this._center;
    this._radius = this._radius;
    this.isShowCollider = this.isShowCollider;
  }
}
