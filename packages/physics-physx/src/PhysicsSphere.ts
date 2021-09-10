import { PhysXManager } from "./PhysXManager";
import { IPhysicsSphere } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./ColliderShape";

/** Physics Shape for Sphere */
export class PhysicsSphere extends ColliderShape implements IPhysicsSphere {
  private _radius: number = 1.0;

  /** radius of sphere shape */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param value size of SphereCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(index: number, value: number, position: Vector3, rotation: Quaternion) {
    this._radius = value;
    this._position = position;
    this._rotation = rotation;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setLocalPose(this._position, this._rotation);
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(index, 0, 0, 0));
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxSphereGeometry(this._radius);
  }
}
