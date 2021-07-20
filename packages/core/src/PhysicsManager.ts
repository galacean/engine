import { Ray, Vector3 } from "@oasis-engine/math";
import { Layer } from "./Layer";
import { ColliderFeature } from "./collider";
import { Engine } from "./Engine";
import { Collider } from "./collider/Collider";

/**
 * The result of raycast test.
 */
export class HitResult {
  /** The collider that was hit. */
  collider: Collider = null;
  /** The distance from the origin to the hit point. */
  distance: Number;
  /** The hit point of the collider that was hit in world space. */
  point: Vector3 = new Vector3();
  /** The hit normal of the collider that was hit in world space. */
  normal: Vector3 = new Vector3();

  constructor(distance: number = Number.MAX_VALUE) {
    this.distance = distance;
  }
}

export class PhysicsManager {
  _engine: Engine;

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask- Layer mask that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask- Layer mask that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance?: number, layerMask?: Layer, outHitResult?: HitResult): Boolean {
    const cf = this._engine.sceneManager.activeScene.findFeature(ColliderFeature);
    const colliders = cf.colliders;

    let nearestHit = new HitResult();
    const hit = new HitResult();
    if (distance != undefined) {
      nearestHit.distance = distance;
      hit.distance = distance;
    }

    for (let i = 0, len = colliders.length; i < len; i++) {
      const collider = colliders[i];
      if (!collider.entity.isActiveInHierarchy) {
        continue;
      }

      if (layerMask == undefined) {
        if (!(collider.entity.layer & Layer.Everything)) {
          continue;
        }
      } else {
        if (!(collider.entity.layer & layerMask)) {
          continue;
        }
      }

      if (collider._raycast(ray, hit)) {
        if (hit.distance < nearestHit.distance) {
          nearestHit = hit;
        }
      }
    }

    if (outHitResult != undefined) {
      outHitResult.normal = nearestHit.normal;
      outHitResult.point = nearestHit.point;
      outHitResult.distance = nearestHit.distance;
      outHitResult.collider = nearestHit.collider;
    }

    return nearestHit.collider != undefined;
  }
}
