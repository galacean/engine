import { ABoxCollider } from "./ABoxCollider";
import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";

export class BoxCollider extends ABoxCollider {
  private _center: Vector3 = new Vector3();
  private _size: Vector3 = new Vector3();
  private isShowCollider: boolean = true;

  constructor(
    entity: Entity,
    props?: {
      center: Vector3;
      size: Vector3;
      isShowCollider: boolean;
    }
  ) {
    super(entity, props);

    const { center, size, isShowCollider } = props;

    center && (this.center = center);
    size && (this.size = size);
    this.isShowCollider = isShowCollider;
  }

  get center(): Vector3 {
    return this._center;
  }

  set center(value: Vector3) {
    this._center = value;
    this.setBoxCenterSize(this._center, this._size);
  }

  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    this._size = value;
    this.setBoxCenterSize(this._center, this._size);
  }
}
