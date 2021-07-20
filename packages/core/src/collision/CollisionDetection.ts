import { BoundingBox, Vector3 } from "@oasis-engine/math";
import { ACollider, ABoxCollider, ASphereCollider, ColliderFeature } from "../collider";
import { Script } from "../Script";
import { intersectBox2Box, intersectSphere2Box, intersectSphere2Sphere } from "./intersect";

/**
 * Detect collisions between the Collider on the current entity and other Colliders in the scene.
 */
export class CollisionDetection extends Script {
  private static _tempBox1: BoundingBox = new BoundingBox();
  private static _tempBox2: BoundingBox = new BoundingBox();

  private _colliderManager;
  private _myCollider;
  private _overlappedCollider;
  private _sphere;
  private _box: BoundingBox = new BoundingBox();

  /**
   * Constructor of the collision detection.
   * @param entity - Entity to which the collision detection belong
   */
  constructor(entity) {
    super(entity);
  }

  /**
   * The collider that intersects with the collider on the current Entity.
   */
  get overlappedCollider() {
    return this._overlappedCollider;
  }

  /**
   * When every frame is updated, calculate the collision with other collider.
   */
  onUpdate(deltaTime) {
    super.onUpdate(deltaTime);

    let overlappedCollider = null;

    if (this._colliderManager && this._myCollider) {
      const colliders = this._colliderManager.colliders;

      if (this._myCollider instanceof ABoxCollider) {
        this._updateWorldBox(this._myCollider, this._box);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._boxCollision(collider)) {
            overlappedCollider = collider;
            let scripts: Script[] = [];
            this.entity.getComponents(Script, scripts);
            scripts.forEach((script) => {
              script.onTriggerStay(collider);
            });
          }
        } // end of for
      } else if (this._myCollider instanceof ASphereCollider) {
        this._sphere = this._getWorldSphere(this._myCollider);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._sphereCollision(collider)) {
            overlappedCollider = collider;
            let scripts: Script[] = [];
            this.entity.getComponents(Script, scripts);
            scripts.forEach((script) => {
              script.onTriggerStay(collider);
            });
          }
        } // end of for
      }
    } // end of if

    //-- overlap events
    if (overlappedCollider != null && this._overlappedCollider != overlappedCollider) {
      let scripts: Script[] = [];
      this.entity.getComponents(Script, scripts);
      scripts.forEach((script) => {
        script.onTriggerEnter(overlappedCollider);
      });
    }

    if (this._overlappedCollider != null && this._overlappedCollider != overlappedCollider) {
      let scripts: Script[] = [];
      this.entity.getComponents(Script, scripts);
      scripts.forEach((script) => {
        script.onTriggerExit(this._overlappedCollider);
      });
    }

    this._overlappedCollider = overlappedCollider;
  }

  /**
   * Calculate the boundingbox in world space from boxCollider.
   * @param boxCollider - The boxCollider to calculate
   * @param out - The calculated boundingBox
   */
  _updateWorldBox(boxCollider, out: BoundingBox): void {
    const mat = boxCollider.entity.transform.worldMatrix;
    const source = CollisionDetection._tempBox1;
    boxCollider.boxMax.cloneTo(source.max);
    boxCollider.boxMin.cloneTo(source.min);
    BoundingBox.transform(source, mat, out);
  }

  /**
   * Get the sphere info of the given sphere collider in world space.
   * @param sphereCollider - The given sphere collider
   */
  _getWorldSphere(sphereCollider) {
    const center: Vector3 = new Vector3();
    Vector3.transformCoordinate(sphereCollider.center, sphereCollider.entity.transform.worldMatrix, center);
    return {
      radius: sphereCollider.radius,
      center
    };
  }

  /**
   * Collider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  _boxCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = CollisionDetection._tempBox2;
      this._updateWorldBox(other, box);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Box(sphere, this._box);
    }
    return false;
  }

  /**
   * Collider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  _sphereCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = CollisionDetection._tempBox2;
      this._updateWorldBox(other, box);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }

  onAwake() {
    this._colliderManager = this.scene.findFeature(ColliderFeature);
    this._myCollider = this.entity.getComponent(ACollider);
  }
}
