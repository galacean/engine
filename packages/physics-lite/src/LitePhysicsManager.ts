import { IPhysicsManager } from "@oasis-engine/design";
import { BoundingBox, BoundingSphere, Ray, Vector3 } from "@oasis-engine/math";
import { LiteCollider } from "./LiteCollider";
import { HitResult } from "./HitResult";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";
import { intersectBox2Box, intersectSphere2Box, intersectSphere2Sphere } from "./intersect";
import { LiteColliderShape } from "./shape/LiteColliderShape";
import { DisorderedArray } from "./DisorderedArray";

/** A scene is a collection of bodies and constraints which can interact. */
export class LitePhysicsManager implements IPhysicsManager {
  private static _tempBox1: BoundingBox = new BoundingBox();
  private static _tempBox2: BoundingBox = new BoundingBox();
  private static _currentHit: HitResult = new HitResult();
  private static _hitResult: HitResult = new HitResult();

  private readonly _onContactEnter?: (obj1: number, obj2: number) => void;
  private readonly _onContactExit?: (obj1: number, obj2: number) => void;
  private readonly _onContactStay?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerEnter?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerExit?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerStay?: (obj1: number, obj2: number) => void;

  private _colliders: LiteCollider[] = [];
  private _sphere?: BoundingSphere;
  private _box: BoundingBox = new BoundingBox();

  private _currentEvents: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private _eventMap: Record<number, Record<number, TriggerEvent>> = {};
  private _eventPool: TriggerEvent[] = [];

  constructor(
    onContactEnter?: (obj1: number, obj2: number) => void,
    onContactExit?: (obj1: number, obj2: number) => void,
    onContactStay?: (obj1: number, obj2: number) => void,
    onTriggerEnter?: (obj1: number, obj2: number) => void,
    onTriggerExit?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ) {
    this._onContactEnter = onContactEnter;
    this._onContactExit = onContactExit;
    this._onContactStay = onContactStay;
    this._onTriggerEnter = onTriggerEnter;
    this._onTriggerExit = onTriggerExit;
    this._onTriggerStay = onTriggerStay;
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
  addColliderShape(colliderShape: LiteColliderShape): void {
    this._eventMap[colliderShape._id] = {};
  }

  /**
   * {@inheritDoc IPhysicsManager.removeColliderShape }
   */
  removeColliderShape(colliderShape: LiteColliderShape): void {
    delete this._eventMap[colliderShape._id];
  }

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
    const index = this._colliders.indexOf(collider);
    if (index !== -1) {
      this._colliders.splice(index, 1);
    }
  }

  /**
   * {@inheritDoc IPhysicsManager.update }
   */
  update(deltaTime: number): void {
    let colliders = this._colliders;
    for (let i = 0, len = colliders.length; i < len; i++) {
      this._collisionDetection(deltaTime, colliders[i]);
    }
    this._fireEvent();
  }

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

  /**
   * Calculate the boundingbox in world space from boxCollider.
   * @param boxCollider - The boxCollider to calculate
   * @param out - The calculated boundingBox
   */
  private static _updateWorldBox(boxCollider: LiteBoxColliderShape, out: BoundingBox): void {
    const mat = boxCollider._transform.worldMatrix;
    const source = LitePhysicsManager._tempBox1;
    boxCollider._boxMax.cloneTo(source.max);
    boxCollider._boxMin.cloneTo(source.min);
    BoundingBox.transform(source, mat, out);
  }

  /**
   * Get the sphere info of the given sphere collider in world space.
   * @param sphereCollider - The given sphere collider
   */
  private static _getWorldSphere(sphereCollider: LiteSphereColliderShape): BoundingSphere {
    const center: Vector3 = new Vector3();
    Vector3.transformCoordinate(sphereCollider._transform.position, sphereCollider._transform.worldMatrix, center);
    return new BoundingSphere(center, sphereCollider.radius);
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    const event = this._eventPool.length ? this._eventPool.pop() : new TriggerEvent(index1, index2);
    this._eventMap[index1][index2] = event;
    return event;
  }

  private _collisionDetection(deltaTime: number, myCollider: LiteCollider): void {
    const colliders = this._colliders;

    const myColliderShapes = myCollider._shapes;
    for (let i = 0, len = myColliderShapes.length; i < len; i++) {
      const myShape = myColliderShapes[i];
      if (myShape instanceof LiteBoxColliderShape) {
        LitePhysicsManager._updateWorldBox(myShape, this._box);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const colliderShape = colliders[i]._shapes;
          for (let i = 0, len = colliderShape.length; i < len; i++) {
            const shape = colliderShape[i];
            const index1 = shape._id;
            const index2 = myShape._id;
            const event = index1 < index2 ? this._eventMap[index1][index2] : this._eventMap[index2][index1];
            if (event !== undefined && !event.needUpdate) {
              continue;
            }
            if (shape != myShape && this._boxCollision(shape)) {
              if (event === undefined) {
                const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
                event.state = TriggerEventState.Enter;
                event.needUpdate = false;
                this._currentEvents.add(event);
              } else if (event.state === TriggerEventState.Enter) {
                event.state = TriggerEventState.Stay;
                event.needUpdate = false;
              } else if (event.state === TriggerEventState.Stay) {
                event.needUpdate = false;
              }
            }
          }
        }
      } else if (myShape instanceof LiteSphereColliderShape) {
        this._sphere = LitePhysicsManager._getWorldSphere(myShape);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const colliderShape = colliders[i]._shapes;
          for (let i = 0, len = colliderShape.length; i < len; i++) {
            const shape = colliderShape[i];
            const index1 = shape._id;
            const index2 = myShape._id;
            const event = index1 < index2 ? this._eventMap[index1][index2] : this._eventMap[index2][index1];
            if (event !== undefined && !event.needUpdate) {
              continue;
            }
            if (shape != myShape && this._sphereCollision(shape)) {
              if (event === undefined) {
                const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
                event.state = TriggerEventState.Enter;
                event.needUpdate = false;
                this._currentEvents.add(event);
              } else if (event.state === TriggerEventState.Enter) {
                event.state = TriggerEventState.Stay;
                event.needUpdate = false;
              } else if (event.state === TriggerEventState.Stay) {
                event.needUpdate = false;
              }
            }
          }
        }
      }
    }
  }

  private _fireEvent(): void {
    const { _eventPool: eventPool, _currentEvents: currentEvents } = this;
    for (let i = 0, n = currentEvents.length; i < n; ) {
      const event = currentEvents.get(i);
      if (!event.needUpdate) {
        if (event.state == TriggerEventState.Enter) {
          this._onTriggerEnter(event.index1, event.index2);
          event.needUpdate = true;
          i++;
        } else if (event.state == TriggerEventState.Stay) {
          this._onTriggerStay(event.index1, event.index2);
          event.needUpdate = true;
          i++;
        }
      } else {
        event.state = TriggerEventState.Exit;
        this._eventMap[event.index1][event.index2] = undefined;

        this._onTriggerExit(event.index1, event.index2);

        currentEvents.deleteByIndex(i);
        eventPool.push(event);
        n--;
      }
    }
  }

  /**
   * LiteCollider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  private _boxCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      LitePhysicsManager._updateWorldBox(other, box);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = LitePhysicsManager._getWorldSphere(other);
      return intersectSphere2Box(sphere, this._box);
    }
    return false;
  }

  /**
   * LiteCollider and another collider do collision detection.
   * @param other - The another collider to collision detection
   */
  private _sphereCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsManager._tempBox2;
      LitePhysicsManager._updateWorldBox(other, box);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = LitePhysicsManager._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }
}

/**
 * Physics state
 */
enum TriggerEventState {
  Enter,
  Stay,
  Exit
}

/**
 * Trigger event to store interactive object ids and state.
 */
class TriggerEvent {
  state: TriggerEventState;
  index1: number;
  index2: number;
  needUpdate: boolean = false;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}
