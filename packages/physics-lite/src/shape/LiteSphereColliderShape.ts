import { ISphereColliderShape } from "@galacean/engine-design";
import { LiteColliderShape } from "./LiteColliderShape";
import { BoundingSphere, Quaternion, Ray, Vector3, Vector4 } from "@galacean/engine";
import { LiteHitResult } from "../LiteHitResult";
import { LitePhysicsMaterial } from "../LitePhysicsMaterial";

/**
 * Sphere collider shape in Lite.
 */
export class LiteSphereColliderShape extends LiteColliderShape implements ISphereColliderShape {
  private static _tempSphere: BoundingSphere = new BoundingSphere();

  private _radius: number = 1;
  private _maxScale: number = 1;

  get worldRadius(): number {
    return this._radius * this._maxScale;
  }

  /**
   * Init sphere shape.
   * @param uniqueID - UniqueID mark collider
   * @param radius - Size of SphereCollider
   * @param material - Material of PhysXCollider
   */
  constructor(uniqueID: number, radius: number, material: LitePhysicsMaterial) {
    super();
    this._radius = radius;
    this._id = uniqueID;
  }

  /**
   * {@inheritDoc ISphereColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._maxScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  }

  /**
   * {@inheritDoc IColliderShape.pointDistance }
   */
  override pointDistance(position: Vector3, rotation: Quaternion, point: Vector3): Vector4 {
    const p = LiteColliderShape._tempPoint;
    Vector3.subtract(point, position, p);
    const direction = p.normalize();

    Vector3.scale(direction, this.worldRadius, p);
    p.add(position);

    const res = LiteColliderShape._tempVector4;
    if (Vector3.equals(p, point)) {
      res.set(point.x, point.y, point.z, 0);
    } else {
      res.set(p.x, p.y, p.z, Vector3.distanceSquared(p, point));
    }

    return res;
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: LiteHitResult): boolean {
    const boundingSphere = LiteSphereColliderShape._tempSphere;
    Vector3.transformCoordinate(this._transform.position, this._collider._transform.worldMatrix, boundingSphere.center);
    boundingSphere.radius = this.worldRadius;

    const rayDistance = ray.intersectSphere(boundingSphere);
    if (rayDistance !== -1) {
      this._updateHitResult(ray, rayDistance, hit, ray.origin, true);
      return true;
    } else {
      return false;
    }
  }
}
