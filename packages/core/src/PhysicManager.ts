import { Ray, Vector3 } from "@oasis-engine/math";
import { Scene } from "./Scene";
import { Layer } from "./Layer";
import { ColliderFeature } from "./collider";
import { Engine } from "./Engine";
import { Collider } from "./collider/Collider";

/**
 * The result of raycast test.
 */
export class RaycastHit {
  public distance: number;
  public collider: Collider;
  public point: Vector3;

  /**
   * Constructor of RaycastHit.
   */
  constructor() {
    /** The distance from the collider point to the origin of the ray. */
    this.distance = Number.MAX_VALUE;

    /** The collider that has been intersecting. */
    this.collider = null;

    /** The point where the ray intersects.  */
    this.point = null;
  }
}

export class PhysicManager {
  _activeScene: Scene;

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {
    this._activeScene = engine.sceneManager.activeScene;
  }

  /**
   * Perform ray detection on all Colliders in the scene and return to the one closest to the beginning of the ray.
   * @param ray - The ray to perform
   * @param _outPos - The point where the ray intersects
   * @param tag - raycast object's layer
   * @return The collider that has been intersecting
   */
  raycast(ray: Ray, _outPos: Vector3, tag: Layer = Layer.Everything): Collider {
    const cf = this._activeScene.findFeature(ColliderFeature);
    const colliders = cf.colliders;

    let nearestHit = new RaycastHit();
    const hit = new RaycastHit();

    for (let i = 0, len = colliders.length; i < len; i++) {
      const collider = colliders[i];
      if (!collider.entity.isActiveInHierarchy) {
        continue;
      }

      if (!(collider.entity.layer & tag)) {
        continue;
      }

      if (collider._raycast(ray, hit)) {
        if (hit.distance < nearestHit.distance) {
          nearestHit = hit;
        }
      }
    }

    if (_outPos && nearestHit.collider) {
      nearestHit.point.cloneTo(_outPos);
    }

    return nearestHit.collider;
  }
}
