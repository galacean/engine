import { PhysXManager } from "./PhysXManager";
import { Collider } from "./Collider";

export class SphereCollider extends Collider {
  private _radius: number = 0.0;
  private _pxGeometry: any;

  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._is_dirty = true;
  }

  init(group_id: number) {
    if (this._is_dirty) {
      this._pxGeometry = new PhysXManager.PhysX.PxSphereGeometry(this._radius);
      this._pxShape = PhysXManager.physics.createShape(this._pxGeometry, this._material.create(), false, this._flags);

      this._group_id = group_id;
      const data = new PhysXManager.PhysX.PxFilterData(group_id, 0, 0, 0);
      this._pxShape.setQueryFilterData(data);
      const transform = {
        translation: {
          x: this._center.x,
          y: this._center.y,
          z: this._center.z
        },
        rotation: {
          w: 1,
          x: 0,
          y: 0,
          z: 0
        }
      };
      this._pxShape.setLocalPose(transform);

      this._is_dirty = false;

      this.attachActor();
    }
  }
}
