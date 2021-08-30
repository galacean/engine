import { Ray } from "@oasis-engine/math";
import { Layer } from "./Layer";
import { ColliderFeature } from "./collider";
import { Engine } from "./Engine";
import { HitResult } from "./HitResult";

/*
 * Manager for physical scenes.
 */
export class PhysicsManager {
  private static _currentHit: HitResult = new HitResult();

  private _engine: Engine;

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
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, outHitResult: HitResult): Boolean;

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
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, outHitResult: HitResult): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): Boolean;

  raycast(
    ray: Ray,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): Boolean {
    const cf = this._engine.sceneManager.activeScene.findFeature(ColliderFeature);
    const colliders = cf.colliders;

    let distance: number = Number.MAX_VALUE;
    if (typeof distanceOrResult === "number") {
      distance = distanceOrResult;
    }

    let hasResult: Boolean = false;
    let hitResult: HitResult = outHitResult;
    if (distanceOrResult instanceof HitResult) {
      hasResult = true;
      hitResult = distanceOrResult;
    } else if (layerMaskOrResult instanceof HitResult) {
      hasResult = true;
      hitResult = layerMaskOrResult;
    } else if (outHitResult) {
      hasResult = true;
    }

    let curHit = PhysicsManager._currentHit;
    for (let i = 0, len = colliders.length; i < len; i++) {
      const collider = colliders[i];

      if (
        !(layerMaskOrResult instanceof HitResult) &&
        !(collider.entity.layer & (layerMaskOrResult ? (layerMaskOrResult as Layer) : Layer.Everything))
      ) {
        continue;
      }

      if (collider._raycast(ray, curHit)) {
        if (curHit.distance < distance) {
          if (hasResult) {
            curHit.normal.cloneTo(hitResult.normal);
            curHit.point.cloneTo(hitResult.point);
            hitResult.distance = curHit.distance;
            hitResult.collider = curHit.collider;
          } else {
            return true;
          }
          distance = curHit.distance;
        }
      }
    }

    if (hasResult) {
      return hitResult.collider != null;
    } else {
      return false;
    }
  }
}
