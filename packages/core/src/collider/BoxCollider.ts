import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";
import { ABoxCollider } from "./ABoxCollider";

export class BoxCollider extends ABoxCollider {
  private _center: Vector3 = new Vector3();
  private _size: Vector3 = new Vector3();
  private isShowCollider: boolean = true;

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

  constructor(entity: Entity) {
    super(entity);
    this.center = this.center;
    this.size = this.size;
    this.isShowCollider = this.isShowCollider;
  }
}
