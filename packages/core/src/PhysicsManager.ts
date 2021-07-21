import { Ray, Vector3 } from "@oasis-engine/math";
import { Layer } from "./Layer";
import { ColliderFeature } from "./collider";
import { Engine } from "./Engine";
import { Collider } from "./collider/Collider";

/**
 * Structure used to get information back from a raycast or a sweep.
 */
export class HitResult {
  /** The collider that was hit. */
  collider: Collider = null;
  /** The distance from the origin to the hit point. */
  distance: Number = Number.MAX_VALUE;
  /** The hit point of the collider that was hit in world space. */
  point: Vector3 = new Vector3();
  /** The hit normal of the collider that was hit in world space. */
  normal: Vector3 = new Vector3();

  reInit(distance: number = Number.MAX_VALUE) {
    this.collider = null;
    this.distance = distance;
    this.point.setValue(0, 0, 0);
    this.normal.setValue(0, 0, 0);
  }
}

/*
 * Manager for physical scenes
 */
export class PhysicsManager {
  /** @internal */
  _engine: Engine;
  /** @internal */
  _nearestHit: HitResult = new HitResult();
  /** @internal */
  _hit: HitResult = new HitResult();

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

    this._nearestHit.reInit();
    this._hit.reInit();
    if (distance != undefined) {
      this._nearestHit.distance = distance;
      this._hit.distance = distance;
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

      if (collider._raycast(ray, this._hit)) {
        if (this._hit.distance < this._nearestHit.distance) {
          this._nearestHit = this._hit;
        }
      }
    }

    if (outHitResult != undefined) {
      outHitResult.normal = this._nearestHit.normal;
      outHitResult.point = this._nearestHit.point;
      outHitResult.distance = this._nearestHit.distance;
      outHitResult.collider = this._nearestHit.collider;
    }

    return this._nearestHit.collider != undefined;
  }
}
