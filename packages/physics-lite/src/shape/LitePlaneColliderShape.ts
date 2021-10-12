import { IPlaneColliderShape } from "@oasis-engine/design";
import { LiteColliderShape } from "./LiteColliderShape";
import { LiteHitResult } from "../LiteHitResult";
import { LitePhysicsMaterial } from "../LitePhysicsMaterial";
import { Plane, Quaternion, Ray, Vector3 } from "@oasis-engine/math";

/**
 * Plane collider shape in Lite.
 */
export class LitePlaneColliderShape extends LiteColliderShape implements IPlaneColliderShape {
  private static _tempPlane: Plane = new Plane();

  private _normal: Vector3 = new Vector3(0, 1, 0);

  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param uniqueID - UniqueID mark collider
   * @param material - Material of PhysXCollider
   */
  constructor(uniqueID: number, material: LitePhysicsMaterial) {
    super();
    this._id = uniqueID;
  }

  setRotation(value: Vector3): void {
    const rotation = this._transform.rotationQuaternion;
    Quaternion.rotationYawPitchRoll(value.x, value.y, value.z, rotation);
    this._transform.rotationQuaternion = rotation;

    this._normal.transformByQuat(rotation);
  }

  setWorldScale(scale: Vector3): void {}

  _raycast(ray: Ray, hit: LiteHitResult): boolean {
    const localRay = this._getLocalRay(ray);

    const boundingPlane = LitePlaneColliderShape._tempPlane;
    this._normal.cloneTo(boundingPlane.normal);
    boundingPlane.distance = -Vector3.dot(this._transform.position, boundingPlane.normal);
    const pos = this._transform.position;
    debugger;
    const intersect = localRay.intersectPlane(boundingPlane);
    if (intersect !== -1) {
      this._updateHitResult(localRay, intersect, hit, ray.origin);
      return true;
    } else {
      return false;
    }
  }
}
