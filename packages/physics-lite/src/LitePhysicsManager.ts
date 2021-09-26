import { IPhysicsManager } from "@oasis-engine/design";
import { BoundingBox, Ray, Vector3 } from "@oasis-engine/math";
import { Collider } from "./Collider";
import { HitResult } from "./HitResult";
import { BoxColliderShape } from "./shape/BoxColliderShape";
import { SphereColliderShape } from "./shape/SphereColliderShape";
import { intersectBox2Box, intersectSphere2Box, intersectSphere2Sphere } from "./intersect";
import { ColliderShape } from "./shape/ColliderShape";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/** A scene is a collection of bodies and constraints which can interact. */
export class LitePhysicsManager implements IPhysicsManager {
  private static _tempBox1: BoundingBox = new BoundingBox();
  private static _tempBox2: BoundingBox = new BoundingBox();
  private static _currentHit: HitResult = new HitResult();
  private static _hitResult: HitResult = new HitResult();

  _colliders: Collider[];

  onContactBegin?: Function;
  onContactEnd?: Function;
  onContactPersist?: Function;
  onTriggerBegin?: Function;
  onTriggerEnd?: Function;
  onTriggerPersist?: Function;

  private _overlappedColliderShape: ColliderShape;
  private _sphere;
  private _box: BoundingBox = new BoundingBox();

  /**
   * The collider that intersects with the collider on the current Entity.
   */
  get overlappedColliderShape() {
    return this._overlappedColliderShape;
  }

  constructor(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ) {
    this.onContactBegin = onContactBegin;
    this.onContactEnd = onContactEnd;
    this.onContactPersist = onContactPersist;
    this.onTriggerBegin = onTriggerBegin;
    this.onTriggerEnd = onTriggerEnd;
    this.onTriggerPersist = onTriggerPersist;
  }

  addCollider(actor: Collider) {
    this._colliders.push(actor);
  }

  removeCollider(collider: Collider): void {
    let removeID = this._colliders.findIndex((value) => {
      return value == collider;
    });
    this._colliders.splice(removeID, 1);
  }

  /**
   * call on every frame to update pose of objects
   */
  update(deltaTime: number) {
    let colliders = this._colliders;
    for (let i = 0, len = colliders.length; i < len; i++) {
      this.collisionDetection(deltaTime, colliders[i]);
    }
  }

  collisionDetection(deltaTime: number, myCollider: Collider) {
    let overlappedColliderShape: ColliderShape = null;
    const colliders = this._colliders;

    for (let i = 0, len = myCollider._shape.length; i < len; i++) {
      const myShape = myCollider._shape[i];
      if (myShape instanceof BoxColliderShape) {
        this._updateWorldBox(myShape, this._box);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          for (let i = 0, len = collider._shape.length; i < len; i++) {
            const shape = collider._shape[i];
            if (shape != myShape && this._boxCollision(shape)) {
              overlappedColliderShape = shape;
              this.onTriggerPersist(myShape._id, shape._id);
            }
          }
        } // end of for
      } else if (myShape instanceof SphereColliderShape) {
        this._sphere = this._getWorldSphere(myShape);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          for (let i = 0, len = collider._shape.length; i < len; i++) {
            const shape = collider._shape[i];
            if (shape != myShape && this._sphereCollision(collider)) {
              overlappedColliderShape = shape;
              this.onTriggerPersist(myShape._id, shape._id);
            }
          }
        } // end of for
      }

      //-- overlap events
      if (overlappedColliderShape != null && this._overlappedColliderShape != overlappedColliderShape) {
        this.onTriggerBegin(this._overlappedColliderShape._id, overlappedColliderShape._id);
      }

      if (this._overlappedColliderShape != null && this._overlappedColliderShape != overlappedColliderShape) {
        this.onTriggerEnd(overlappedColliderShape._id, this._overlappedColliderShape._id);
      }

      this._overlappedColliderShape = overlappedColliderShape;
    }
  }

  /**
   * Calculate the boundingbox in world space from boxCollider.
   * @param boxCollider - The boxCollider to calculate
   * @param out - The calculated boundingBox
   */
  _updateWorldBox(boxCollider, out: BoundingBox): void {
    const mat = boxCollider.entity.transform.worldMatrix;
    const source = LitePhysicsManager._tempBox1;
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
    if (other instanceof BoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      this._updateWorldBox(other, box);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof SphereColliderShape) {
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
    if (other instanceof BoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      this._updateWorldBox(other, box);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof SphereColliderShape) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }

  //----------------raycast-----------------------------------------------------
  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, queryFlag: QueryFlag): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, queryFlag: QueryFlag, outHitResult: Function): Boolean;

  raycast(
    ray: Ray,
    distance: number,
    queryFlag: QueryFlag,
    hit?: (id: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const colliders = this._colliders;

    let hitResult: HitResult;
    if (hit) {
      hitResult = LitePhysicsManager._hitResult;
    }

    let isHit = false;
    const curHit = LitePhysicsManager._currentHit;
    for (let i = 0, len = colliders.length; i < len; i++) {
      const collider = colliders[i];

      if (collider._raycast(ray, curHit)) {
        isHit = true;
        if (curHit.distance < distance) {
          if (hitResult) {
            curHit.normal.cloneTo(hitResult.normal);
            curHit.point.cloneTo(hitResult.point);
            hitResult.distance = curHit.distance;
            hitResult.shapeID = curHit.shapeID;
          } else {
            return true;
          }
          distance = curHit.distance;
        }
      }
    }

    if (!isHit && hitResult) {
      hitResult.shapeID = -1;
      hitResult.distance = 0;
      hitResult.point.setValue(0, 0, 0);
      hitResult.normal.setValue(0, 0, 0);
    } else if (isHit && hitResult) {
      hit(hitResult.shapeID, hitResult.distance, hitResult.point, hitResult.normal);
    }
    return isHit;
  }
}
