import { Ray } from "@oasis-engine/math";
import { Layer } from "./Layer";
import { ColliderFeature } from "./collider";
import { Engine } from "./Engine";
import { HitResult } from "./HitResult";

/*
 * Manager for physical scenes
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
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): Boolean;

  raycast(
    ray: Ray,
    distance: number = Number.MAX_VALUE,
    layerMask: Layer = Layer.Everything,
    outHitResult?: HitResult
  ): Boolean {
    const cf = this._engine.sceneManager.activeScene.findFeature(ColliderFeature);
    const colliders = cf.colliders;

    let curHit = PhysicsManager._currentHit;
    for (let i = 0, len = colliders.length; i < len; i++) {
      const collider = colliders[i];

      if (!(collider.entity.layer & layerMask)) {
        continue;
      }

      if (collider._raycast(ray, curHit)) {
        if (curHit.distance < distance) {
          if (outHitResult) {
            curHit.normal.cloneTo(outHitResult.normal);
            curHit.point.cloneTo(outHitResult.point);
            outHitResult.distance = curHit.distance;
            outHitResult.collider = curHit.collider;
          } else {
            return true;
          }
          distance = curHit.distance;
        }
      }
    }

    if (outHitResult) {
      return outHitResult.collider != null;
    } else {
      return false;
    }
  }
}
