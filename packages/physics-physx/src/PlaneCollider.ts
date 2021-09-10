import { PhysXManager } from "./PhysXManager";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPlaneCollider } from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { ShapeFlag } from "./shape/ColliderShape";

/**
 * Represents a plane in three dimensional space.
 */
export class PlaneCollider implements IPlaneCollider {
  private _normal: Vector3 = new Vector3(0, 0, 1);
  private _distance: number = 0;

  protected _position: Vector3;
  protected _rotation: Quaternion;

  protected _index: number;

  protected _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.TRIGGER_SHAPE;

  protected _material: PhysicsMaterial = new PhysicsMaterial(0.1, 0.1, 0.1);

  /**
   * PhysX shape object
   * @internal
   */
  _pxShape: any;

  /**
   * PhysX static actor
   * @internal
   */
  _pxActor: any;

  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    this._material = value;
    this._pxShape.setMaterials([this.material._pxMaterial]);
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
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param normal normal of planeCollider
   * @param distance distance of origin for planeCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithNormalDistance(index: number, normal: Vector3, distance: number, position: Vector3, rotation: Quaternion) {
    this._index = index;
    this._normal = normal;
    this._distance = distance;
    this._position = position;
    this._rotation = rotation;

    this._pxActor = PhysXManager.PhysX.PxCreatePlane(
      PhysXManager.physics,
      new PhysXManager.PhysX.PxPlane(normal.x, normal.y, normal.z, distance),
      this._material._pxMaterial
    );
    this._pxShape = this._pxActor.getShape();
    this._pxActor.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._index, 0, 0, 0));
  }
}
