import { Component } from "../Component";
import { Entity } from "../Entity";
import { ColliderFeature } from "./ColliderFeature";
import { Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "../PhysicsManager";

/**
 * Define collider data.
 */
export class Collider extends Component {
  /** @internal */
  _tempVec3: Vector3 = new Vector3();
  /** @internal */
  _ray = new Ray();

  /**
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);
  }

  _onEnable(): void {
    this.scene.findFeature(ColliderFeature).attachCollider(this);
  }

  _onDisable(): void {
    this.scene.findFeature(ColliderFeature).detachCollider(this);
  }

  /**
   * Calculate the raycasthit in world space.
   * @param ray - The ray
   * @param distance - The distance
   * @param outHit - The raycasthit
   * @private
   */
  _updateHitResult(ray: Ray, distance: number, outHit: HitResult, origin: Vector3, isWorldRay: boolean = false) {
    const hitPos = this._tempVec3;
    ray.getPoint(distance, hitPos);
    if (!isWorldRay) {
      Vector3.transformCoordinate(hitPos, this.entity.transform.worldMatrix, hitPos);
    }

    outHit.distance = Vector3.distance(origin, hitPos);
    outHit.collider = this;
    outHit.point = hitPos;
  }

  /**
   * transform ray to local space
   * @param {Ray} ray
   * @private
   */
  _getLocalRay(ray: Ray): Ray {
    const worldToLocal = this.entity.getInvModelMatrix();
    const outRay = this._ray;

    Vector3.transformCoordinate(ray.origin, worldToLocal, outRay.origin);
    Vector3.transformNormal(ray.direction, worldToLocal, outRay.direction);
    outRay.direction.normalize();

    return outRay;
  }

  _raycast(ray: Ray, hit: HitResult): boolean {
    return false;
  }
}
