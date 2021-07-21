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
  private static _ray = new Ray();

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

  protected _updateHitResult(
    ray: Ray,
    distance: number,
    outHit: HitResult,
    origin: Vector3,
    isWorldRay: boolean = false
  ) {
    ray.getPoint(distance, outHit.point);
    if (!isWorldRay) {
      Vector3.transformCoordinate(outHit.point, this.entity.transform.worldMatrix, outHit.point);
    }

    outHit.distance = Vector3.distance(origin, outHit.point);
    outHit.collider = this;
  }

  protected _getLocalRay(ray: Ray): Ray {
    const worldToLocal = this.entity.getInvModelMatrix();
    const outRay = Collider._ray;

    Vector3.transformCoordinate(ray.origin, worldToLocal, outRay.origin);
    Vector3.transformNormal(ray.direction, worldToLocal, outRay.direction);
    outRay.direction.normalize();

    return outRay;
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    throw "Error: use concrete type instead!";
  }
}
