import { ColliderShape } from "./ColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXManager } from "../PhysXManager";

export class PlaneColliderShape extends ColliderShape implements IPlaneColliderShape {
  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param material material of Collider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, material: PhysicsMaterial, position: Vector3, rotation: Quaternion) {
    super();
    this._position = position;
    this._rotation = rotation;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape(material);
    this._setLocalPose(position, rotation);
    this.setID(index);
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxPlaneGeometry();
  }
}
