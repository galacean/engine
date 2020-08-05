import { Entity } from "@alipay/o3-core";
import { ASphereCollider } from "./ASphereCollider";

export class SphereCollider extends ASphereCollider {
  private __center: number[] = [0, 0, 0];
  private __radius: number = 1.0;
  private isShowCollider: boolean = true;

  constructor(entity: Entity, props?: any) {
    super(entity, props);

    const { _center, _radius, isShowCollider } = props;

    this._center = _center;
    this._radius = _radius;
    this.isShowCollider = isShowCollider;
  }

  get _center() {
    return this.__center;
  }

  set _center(value) {
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
