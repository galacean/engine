import { Collider } from "./Collider";
import { Vector3 } from "@oasis-engine/math";
import { PhysXManager } from "./PhysXManager";

/**
 * Represents a plane in three dimensional space.
 */
export class StaticPlaneCollider extends Collider {
  private _normal: Vector3 = new Vector3(0, 0, 1);
  private _distance: number = 0;

  /**
   * normal of collider
   * @remarks will re-alloc new PhysX object.
   */
  get normal(): Vector3 {
    return this._normal;
  }

  set normal(value: Vector3) {
    this._normal = value;
    this.initWithNormalDistance(this._normal, this._distance);
  }

  /**
   * distance of collider
   * @remarks will re-alloc new PhysX object.
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    this._distance = value;
    this.initWithNormalDistance(this._normal, this._distance);
  }

  initWithNormalDistance(normal: Vector3, distance: number) {
    this._normal = normal;
    this._distance = distance;

    this._pxRigidStatic = PhysXManager.PhysX.PxCreatePlane(
      PhysXManager.physics,
      new PhysXManager.PhysX.PxPlane(normal.x, normal.y, normal.z, distance),
      this._material._pxMaterial
    );
    this._pxShape = this._pxRigidStatic.getShape();
    this._pxRigidStatic.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
  }
}
