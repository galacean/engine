import {
  BoundingBox,
  BoundingSphere,
  CollisionUtil,
  DisorderedArray,
  Quaternion,
  Ray,
  Vector3
} from "@galacean/engine";
import { ICharacterController, IPhysicsScene, IPhysicsEvents, ITriggerEvent } from "@galacean/engine-design";
import { LiteCollider } from "./LiteCollider";
import { LiteDynamicCollider } from "./LiteDynamicCollider";
import { LiteHitResult } from "./LiteHitResult";
import { LiteStaticCollider } from "./LiteStaticCollider";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LiteColliderShape } from "./shape/LiteColliderShape";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";
import { LitePhysics } from "./LitePhysics";

/**
 * A manager is a collection of colliders and constraints which can interact.
 */
export class LitePhysicsScene implements IPhysicsScene {
  private static _tempSphere: BoundingSphere = new BoundingSphere();
  private static _tempBox: BoundingBox = new BoundingBox();
  private static _currentHit: LiteHitResult = new LiteHitResult();
  private static _hitResult: LiteHitResult = new LiteHitResult();

  private _staticColliders: LiteStaticCollider[] = [];
  private _dynamicColliders: LiteDynamicCollider[] = [];
  private _sphere: BoundingSphere = new BoundingSphere();
  private _box: BoundingBox = new BoundingBox();

  private _activeTriggers: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private _eventMap: Record<number, Record<number, TriggerEvent>> = {};
  private _triggerEventPool: TriggerEvent[] = [];
  private _triggerEvents: TriggerEvent[] = [];
  private _physicsEvents: IPhysicsEvents = { contactEvents: [], triggerEvents: [] };
  private _physics: LitePhysics;

  constructor(physics: LitePhysics) {
    this._physics = physics;
  }
  overlapBox(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean {
    throw new Error("Method not implemented.");
  }
  overlapSphere(
    center: Vector3,
    radius: number,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean {
    throw new Error("Method not implemented.");
  }
  overlapCapsule(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean {
    throw new Error("Method not implemented.");
  }

  /**
   * {@inheritDoc IPhysicsScene.setGravity }
   */
  setGravity(value: Vector3): void {
    console.log("Physics-lite don't support gravity. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.addCollider }
   */
  addCollider(actor: LiteCollider): void {
    actor._scene = this;
    const colliders = actor._isStaticCollider ? this._staticColliders : this._dynamicColliders;
    colliders.push(actor);
    const shapes = actor._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._addColliderShape(shapes[i]);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.removeCollider }
   */
  removeCollider(collider: LiteCollider): void {
    collider._scene = null;
    const colliders = collider._isStaticCollider ? this._staticColliders : this._dynamicColliders;
    const index = colliders.indexOf(collider);
    index > -1 && colliders.splice(index, 1);
    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeColliderShape(shapes[i]);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.update }
   */
  update(deltaTime: number): void {
    const dynamicColliders = this._dynamicColliders;
    for (let i = 0, len = dynamicColliders.length; i < len; i++) {
      const collider = dynamicColliders[i];
      this._collisionDetection(collider, this._staticColliders);
      this._collisionDetection(collider, dynamicColliders);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.updateEvents }
   */
  updateEvents(): IPhysicsEvents {
    const {
      _triggerEventPool: triggerEventPool,
      _activeTriggers: activeTriggers,
      _triggerEvents: triggerEvents,
      _physicsEvents: physicsEvents
    } = this;
    triggerEvents.length = 0;

    activeTriggers.forEach((event, i) => {
      if (!event.alreadyInvoked) {
        event.dispatchState = event.state;
        triggerEvents.push(event);
        event.alreadyInvoked = true;
      } else {
        event.state = PhysicsEventState.Exit;
        event.dispatchState = PhysicsEventState.Exit;
        this._eventMap[event.index1][event.index2] = undefined;
        activeTriggers.deleteByIndex(i);
        triggerEvents.push(event);
        triggerEventPool.push(event);
      }
    });

    physicsEvents.triggerEvents = triggerEvents;
    return physicsEvents;
  }

  /**
   * {@inheritDoc IPhysicsScene.raycast }
   */
  raycast(
    ray: Ray,
    distance: number,
    onRaycast: (obj: number) => boolean,
    hit?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    if (!hit) {
      return (
        this._raycast(ray, distance, onRaycast, this._staticColliders, hit) ||
        this._raycast(ray, distance, onRaycast, this._dynamicColliders, hit)
      );
    } else {
      const raycastStaticRes = this._raycast(ray, distance, onRaycast, this._staticColliders, hit);

      if (raycastStaticRes) {
        distance = LitePhysicsScene._currentHit.distance;
      }

      const raycastDynamicRes = this._raycast(ray, distance, onRaycast, this._dynamicColliders, hit);
      const isHit = raycastStaticRes || raycastDynamicRes;
      const hitResult = LitePhysicsScene._hitResult;

      if (!isHit) {
        hitResult.shapeID = -1;
        hitResult.distance = 0;
        hitResult.point.set(0, 0, 0);
        hitResult.normal.set(0, 0, 0);
      } else {
        hit(hitResult.shapeID, hitResult.distance, hitResult.point, hitResult.normal);
      }
      return isHit;
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.addCharacterController }
   */
  addCharacterController(characterController: ICharacterController): void {
    throw new Error("Physics-lite doesn't support addCharacterController. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.removeCharacterController }
   */
  removeCharacterController(characterController: ICharacterController): void {
    throw new Error("Physics-lite doesn't support removeCharacterController. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.boxCast }
   */
  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    throw new Error("Physics-lite doesn't support boxCast. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.sphereCast }
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    throw new Error("Physics-lite doesn't support sphereCast. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.capsuleCast }
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    throw new Error("Physics-lite doesn't support capsuleCast. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapBoxAll }
   */
  overlapBoxAll(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    onOverlap: (obj: number) => boolean
  ): number[] {
    throw new Error("Physics-lite doesn't support overlapBoxAll. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapSphereAll }
   */
  overlapSphereAll(center: Vector3, radius: number, onOverlap: (obj: number) => boolean): number[] {
    throw new Error("Physics-lite doesn't support overlapSphereAll. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapCapsuleAll }
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    onOverlap: (obj: number) => boolean
  ): number[] {
    throw new Error("Physics-lite doesn't support overlapCapsuleAll. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysicsScene.destroy }
   */
  destroy(): void {}

  /**
   * @internal
   */
  _addColliderShape(colliderShape: LiteColliderShape): void {
    this._eventMap[colliderShape._id] = {};
  }

  /**
   * @internal
   */
  _removeColliderShape(colliderShape: LiteColliderShape): void {
    const { _triggerEventPool: triggerEventPool, _activeTriggers: activeTriggers, _eventMap: eventMap } = this;
    const { _id: id } = colliderShape;
    activeTriggers.forEach((event, i) => {
      if (event.index1 == id) {
        activeTriggers.deleteByIndex(i);
        triggerEventPool.push(event);
      } else if (event.index2 == id) {
        activeTriggers.deleteByIndex(i);
        triggerEventPool.push(event);
        // If the shape is big index, should clear from the small index shape subMap
        eventMap[event.index1][id] = undefined;
      }
    });
    delete eventMap[id];
  }

  /**
   * Calculate the bounding box in world space from boxCollider.
   * @param boxCollider - The boxCollider to calculate
   * @param out - The calculated boundingBox
   */
  private static _updateWorldBox(boxCollider: LiteBoxColliderShape, out: BoundingBox): void {
    const mat = boxCollider._transform.worldMatrix;
    out.min.copyFrom(boxCollider._boxMin);
    out.max.copyFrom(boxCollider._boxMax);
    BoundingBox.transform(out, mat, out);
  }

  /**
   * Get the sphere info of the given sphere collider in world space.
   * @param sphereCollider - The given sphere collider
   * @param out - The calculated boundingSphere
   */
  private static _upWorldSphere(sphereCollider: LiteSphereColliderShape, out: BoundingSphere): void {
    Vector3.transformCoordinate(sphereCollider._transform.position, sphereCollider._transform.worldMatrix, out.center);
    out.radius = sphereCollider.worldRadius;
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    let event: TriggerEvent;
    if (this._triggerEventPool.length) {
      event = this._triggerEventPool.pop();
      event.index1 = index1;
      event.index2 = index2;
    } else {
      event = new TriggerEvent(index1, index2);
    }
    this._eventMap[index1][index2] = event;
    return event;
  }

  private _collisionDetection(myCollider: LiteCollider, colliders: LiteCollider[]): void {
    const myColliderShapes = myCollider._shapes;
    for (let i = 0, len = myColliderShapes.length; i < len; i++) {
      const myShape = myColliderShapes[i];
      if (myShape instanceof LiteBoxColliderShape) {
        LitePhysicsScene._updateWorldBox(myShape, this._box);
        for (let j = 0, len = colliders.length; j < len; j++) {
          const collider = colliders[j];
          const colliderShape = collider._shapes;

          // Skip collision check if layers can't collide
          if (!this._checkColliderCollide(collider, myCollider)) {
            continue;
          }

          for (let k = 0, len = colliderShape.length; k < len; k++) {
            const shape = colliderShape[k];
            const index1 = shape._id;
            const index2 = myShape._id;
            const event = index1 < index2 ? this._eventMap[index1][index2] : this._eventMap[index2][index1];
            if (event !== undefined && !event.alreadyInvoked) {
              continue;
            }
            if (shape != myShape && this._boxCollision(shape)) {
              if (event === undefined) {
                const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
                event.state = PhysicsEventState.Enter;
                event.alreadyInvoked = false;
                this._activeTriggers.add(event);
              } else if (event.state === PhysicsEventState.Enter) {
                event.state = PhysicsEventState.Stay;
                event.alreadyInvoked = false;
              } else if (event.state === PhysicsEventState.Stay) {
                event.alreadyInvoked = false;
              }
            }
          }
        }
      } else if (myShape instanceof LiteSphereColliderShape) {
        LitePhysicsScene._upWorldSphere(myShape, this._sphere);
        for (let j = 0, len = colliders.length; j < len; j++) {
          const collider = colliders[j];
          const colliderShape = collider._shapes;

          // Skip collision check if layers can't collide
          if (!this._checkColliderCollide(collider, myCollider)) {
            continue;
          }

          for (let k = 0, len = colliderShape.length; k < len; k++) {
            const shape = colliderShape[k];
            const index1 = shape._id;
            const index2 = myShape._id;
            const event = index1 < index2 ? this._eventMap[index1][index2] : this._eventMap[index2][index1];
            if (event !== undefined && !event.alreadyInvoked) {
              continue;
            }
            if (shape != myShape && this._sphereCollision(shape)) {
              if (event === undefined) {
                const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
                event.state = PhysicsEventState.Enter;
                event.alreadyInvoked = false;
                this._activeTriggers.add(event);
              } else if (event.state === PhysicsEventState.Enter) {
                event.state = PhysicsEventState.Stay;
                event.alreadyInvoked = false;
              } else if (event.state === PhysicsEventState.Stay) {
                event.alreadyInvoked = false;
              }
            }
          }
        }
      }
    }
  }

  private _boxCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsScene._tempBox;
      LitePhysicsScene._updateWorldBox(other, box);
      return CollisionUtil.intersectsBoxAndBox(box, this._box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = LitePhysicsScene._tempSphere;
      LitePhysicsScene._upWorldSphere(other, sphere);
      return CollisionUtil.intersectsSphereAndBox(sphere, this._box);
    }
    return false;
  }

  private _sphereCollision(other: LiteColliderShape): boolean {
    if (other instanceof LiteBoxColliderShape) {
      const box = LitePhysicsScene._tempBox;
      LitePhysicsScene._updateWorldBox(other, box);
      return CollisionUtil.intersectsSphereAndBox(this._sphere, box);
    } else if (other instanceof LiteSphereColliderShape) {
      const sphere = LitePhysicsScene._tempSphere;
      LitePhysicsScene._upWorldSphere(other, sphere);
      return CollisionUtil.intersectsSphereAndSphere(sphere, this._sphere);
    }
    return false;
  }

  private _raycast(
    ray: Ray,
    distance: number,
    onRaycast: (obj: number) => boolean,
    colliders: LiteCollider[],
    hit?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    let isHit = false;
    const curHit = LitePhysicsScene._currentHit;
    for (let i = 0, len = colliders.length; i < len; i++) {
      if (colliders[i]._raycast(ray, onRaycast, curHit) && curHit.distance < distance) {
        if (hit) {
          isHit = true;
          const hitResult = LitePhysicsScene._hitResult;
          hitResult.normal.copyFrom(curHit.normal);
          hitResult.point.copyFrom(curHit.point);
          hitResult.distance = distance = curHit.distance;
          hitResult.shapeID = curHit.shapeID;
        } else {
          return true;
        }
      }
    }

    return isHit;
  }

  private _checkColliderCollide(collider1: LiteCollider, collider2: LiteCollider): boolean {
    const group1 = collider1._collisionLayer;
    const group2 = collider2._collisionLayer;

    if (group1 === group2) {
      return true;
    }

    return this._physics.getColliderLayerCollision(group1, group2);
  }
}

const PhysicsEventState = {
  Enter: 0,
  Stay: 1,
  Exit: 2
} as const;

/**
 * Trigger event to store interactive object ids and state.
 */
class TriggerEvent implements ITriggerEvent {
  state: number;
  dispatchState: number;
  index1: number;
  index2: number;
  alreadyInvoked = false;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}
