import { IPlaneCollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Collider } from "./Collider";
import { Entity } from "../Entity";

export class PlaneCollider extends Collider {
  _planeCollider: IPlaneCollider;

  /**
   * normal of collider
   * @remarks will re-alloc new PhysX object.
   */
  get normal(): Vector3 {
    return this._planeCollider.normal;
  }

  /**
   * distance of collider
   * @remarks will re-alloc new PhysX object.
   */
  getDistance(): number {
    return this._planeCollider.getDistance();
  }

  /**
   * rotate the normal of plane
   * @param quat new local quaternion
   */
  rotate(quat: Quaternion) {
    this._planeCollider.rotate(quat);
  }

  constructor(entity: Entity) {
    super(entity);
    this._planeCollider = this.engine._physicsEngine.createPlaneCollider();
    this._collider = this._planeCollider;
  }

  initWithNormalDistance(normal: Vector3, distance: number) {
    this._planeCollider.initWithNormalDistance(
      normal,
      distance,
      this.entity.transform.position,
      this.entity.transform.rotationQuaternion
    );
    this.engine.physicsManager.addStaticActor(this);
  }
}
