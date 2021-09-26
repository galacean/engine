import { ISphereColliderShape } from "@oasis-engine/design";
import { ColliderShape } from "./ColliderShape";
import { BoundingSphere, Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "../HitResult";
import { PhysicsMaterial } from "../PhysicsMaterial";

/** LitePhysics Shape for Sphere */
export class SphereColliderShape extends ColliderShape implements ISphereColliderShape {
  private static _tempSphere: BoundingSphere = new BoundingSphere();

  private _center: Vector3 = new Vector3();
  private _radius: number = 1;

  /** center of sphere shape */
  setCenter(value: Vector3) {
    this._center = value;
  }

  /** radius of sphere shape */
  setRadius(radius: number): void {
    this._radius = radius;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius size of SphereCollider
   * @param material material of Collider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, material: PhysicsMaterial, position: Vector3, rotation: Quaternion) {
    super();
    this.setCenter(position);
    this.setRadius(radius);
    // Todo: Support Rotation
    this._transform.setPosition(position.x, position.y, position.z);
    this._inverseWorldMatFlag = this._transform.registerWorldChangeFlag();
    this._id = index;
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    const transform = this._transform;
    const boundingSphere = SphereColliderShape._tempSphere;
    Vector3.transformCoordinate(this._center, transform.worldMatrix, boundingSphere.center);
    const lossyScale = transform.lossyWorldScale;
    boundingSphere.radius = this._radius * Math.max(lossyScale.x, lossyScale.y, lossyScale.z);
    const intersect = ray.intersectSphere(boundingSphere);
    if (intersect !== -1) {
      this._updateHitResult(ray, intersect, hit, ray.origin, true);
      return true;
    } else {
      return false;
    }
  }
}
