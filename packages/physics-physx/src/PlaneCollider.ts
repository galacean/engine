import { Collider } from "./Collider";
import { PhysXManager } from "./PhysXManager";
import { Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { IPlaneCollider } from "@oasis-engine/design";

/**
 * Represents a plane in three dimensional space.
 */
export class PlaneCollider extends Collider implements IPlaneCollider {
  private static tempMatrix = new Matrix();
  private _normal: Vector3 = new Vector3(0, 0, 1);
  private _distance: number = 0;

  /**
   * normal of collider
   * @remarks will re-alloc new PhysX object.
   */
  get normal(): Vector3 {
    return this._normal;
  }

  /**
   * distance of collider
   * @remarks will re-alloc new PhysX object.
   */
  getDistance(): number {
    return this._distance;
  }

  /**
   * rotate the normal of plane
   * @param quat new local quaternion
   */
  rotate(quat: Quaternion) {
    Matrix.rotationQuaternion(quat, PlaneCollider.tempMatrix);
    this.normal.transformNormal(PlaneCollider.tempMatrix);

    const transform = {
      translation: {
        x: this._center.x,
        y: this._center.y,
        z: this._center.z
      },
      rotation: {
        w: quat.w,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
    this._pxShape.setLocalPose(transform);
  }

  initWithNormalDistance(normal: Vector3, distance: number, position: Vector3, rotation: Quaternion) {
    this._normal = normal;
    this._distance = distance;
    this._position = position;
    this._rotation = rotation;

    this._pxRigidStatic = PhysXManager.PhysX.PxCreatePlane(
      PhysXManager.physics,
      new PhysXManager.PhysX.PxPlane(normal.x, normal.y, normal.z, distance),
      this._material._pxMaterial
    );
    this._pxShape = this._pxRigidStatic.getShape();
    this._pxRigidStatic.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
  }
}
