import { IPhysicsManager } from "@oasis-engine/design";
import { BoundingBox, BoundingSphere, Ray, Vector3 } from "@oasis-engine/math";
import { LiteCollider } from "./LiteCollider";
import { HitResult } from "./HitResult";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";
import { intersectBox2Box, intersectSphere2Box, intersectSphere2Sphere } from "./intersect";
import { LiteColliderShape } from "./shape/LiteColliderShape";

/** A scene is a collection of bodies and constraints which can interact. */
export class LitePhysicsManager implements IPhysicsManager {
  private static _tempBox1: BoundingBox = new BoundingBox();
  private static _tempBox2: BoundingBox = new BoundingBox();
  private static _currentHit: HitResult = new HitResult();
  private static _hitResult: HitResult = new HitResult();

  private _overlappedColliderShape: LiteColliderShape;
  private _sphere;
  private _box: BoundingBox = new BoundingBox();

  _colliders: LiteCollider[];

  onContactBegin?: (obj1: number, obj2: number) => void;
  onContactEnd?: (obj1: number, obj2: number) => void;
  onContactPersist?: (obj1: number, obj2: number) => void;
  onTriggerBegin?: (obj1: number, obj2: number) => void;
  onTriggerEnd?: (obj1: number, obj2: number) => void;
  onTriggerPersist?: (obj1: number, obj2: number) => void;

  constructor(
    onContactBegin?: (obj1: number, obj2: number) => void,
    onContactEnd?: (obj1: number, obj2: number) => void,
    onContactPersist?: (obj1: number, obj2: number) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerPersist?: (obj1: number, obj2: number) => void
  ) {
    this.onContactBegin = onContactBegin;
    this.onContactEnd = onContactEnd;
    this.onContactPersist = onContactPersist;
    this.onTriggerBegin = onTriggerBegin;
    this.onTriggerEnd = onTriggerEnd;
    this.onTriggerPersist = onTriggerPersist;
  }

  /**
   * {@inheritDoc IPhysicsManager.setGravity }
   */
  setGravity(value: Vector3): void {
    throw "unimplemented";
  }

  /**
   * {@inheritDoc IPhysicsManager.addColliderShape }
   */
  addColliderShape(colliderShape: LiteColliderShape): void {}

  /**
   * {@inheritDoc IPhysicsManager.removeColliderShape }
   */
  removeColliderShape(colliderShape: LiteColliderShape): void {}

  /**
   * {@inheritDoc IPhysicsManager.addCollider }
   */
  addCollider(actor: LiteCollider): void {
    this._colliders.push(actor);
  }

  /**
   * {@inheritDoc IPhysicsManager.removeCollider }
   */
  removeCollider(collider: LiteCollider): void {
    let removeID = this._colliders.findIndex((value) => {
      return value == collider;
    });
    this._colliders.splice(removeID, 1);
  }

  /**
   * call on every frame to update pose of objects
   */
  update(deltaTime: number): void {
    let colliders = this._colliders;
    for (let i = 0, len = colliders.length; i < len; i++) {
      this.collisionDetection(deltaTime, colliders[i]);
    }
  }

  collisionDetection(deltaTime: number, myCollider: LiteCollider): void {
    let overlappedColliderShape: LiteColliderShape = null;
    const colliders = this._colliders;

    for (let i = 0, len = myCollider._shapes.length; i < len; i++) {
      const myShape = myCollider._shapes[i];
      if (myShape instanceof LiteBoxColliderShape) {
        this._updateWorldBox(myShape, this._box);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          for (let i = 0, len = collider._shapes.length; i < len; i++) {
            const shape = collider._shapes[i];
            if (shape != myShape && this._boxCollision(shape)) {
              overlappedColliderShape = shape;
              this.onTriggerPersist(myShape._id, shape._id);
            }
          }
        } // end of for
      } else if (myShape instanceof LiteSphereColliderShape) {
        this._sphere = this._getWorldSphere(myShape);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          for (let i = 0, len = collider._shapes.length; i < len; i++) {
            const shape = collider._shapes[i];
            if (shape != myShape && this._sphereCollision(shape)) {
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
  _getWorldSphere(sphereCollider: LiteSphereColliderShape): BoundingSphere {
    const center: Vector3 = new Vector3();
    Vector3.transformCoordinate(sphereCollider._transform.position, sphereCollider._transform.worldMatrix, center);
    return new BoundingSphere(center, sphereCollider.radius);
  }

  /**
   * LiteCollider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  _boxCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      this._updateWorldBox(other, box);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Box(sphere, this._box);
    }
    return false;
  }

  /**
   * LiteCollider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  _sphereCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      this._updateWorldBox(other, box);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }

  //----------------raycast-----------------------------------------------------
  /**
   * {@inheritDoc IPhysicsManager.raycast }
   */
  raycast(
    ray: Ray,
    distance: number,
    hit?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
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
