import { PhysXManager } from "./PhysXManager";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysicsShape } from "./PhysicsShape";
import { IStaticCollider } from "@oasis-engine/design";

export class StaticCollider implements IStaticCollider {
  protected _position: Vector3;
  protected _rotation: Quaternion;

  /**
   * PhysX static actor object
   * @internal
   */
  _pxActor: any;

  init(position: Vector3, rotation: Quaternion) {
    this._position = position;
    this._rotation = rotation;
    const quat = this._rotation.normalize();
    const transform = {
      translation: {
        x: this._position.x,
        y: this._position.y,
        z: this._position.z
      },
      rotation: {
        w: quat.w, // PHYSX uses WXYZ quaternions,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
    this._pxActor = PhysXManager.physics.createRigidStatic(transform);
  }

  attachShape(shape: PhysicsShape) {
    this._pxActor.attachShape(shape._pxShape);
  }

  setGlobalPose(position: Vector3, rotation: Quaternion) {
    this._position = position;
    this._rotation = rotation;
    const quat = this._rotation.normalize();
    const transform = {
      translation: {
        x: this._position.x,
        y: this._position.y,
        z: this._position.z
      },
      rotation: {
        w: quat.w, // PHYSX uses WXYZ quaternions,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
    this._pxActor.setGlobalPose(transform, true);
  }

  getGlobalPose(): { translation: Vector3; rotation: Quaternion } {
    const transform = this._pxActor.getGlobalPose();
    return {
      translation: new Vector3(transform.translation.x, transform.translation.y, transform.translation.z),
      rotation: new Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)
    };
  }
}
