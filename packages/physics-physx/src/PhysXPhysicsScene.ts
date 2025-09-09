import { Ray, Vector3, DisorderedArray, Quaternion } from "@galacean/engine";
import { ICollision, IPhysicsScene } from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";

/**
 * A manager is a collection of colliders and constraints which can interact.
 */
export class PhysXPhysicsScene implements IPhysicsScene {
  /** @internal */
  _pxControllerManager: any = null;

  private static _tempPosition: Vector3 = new Vector3();
  private static _tempQuaternion: Quaternion = new Quaternion();
  private static _tempNormal: Vector3 = new Vector3();
  private static _tempPose: { translation: Vector3; rotation: Quaternion } = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };
  private static _tempShapeIDs: number[] = [];

  // Cached geometry objects for reuse
  private _boxGeometry: any = null;
  private _sphereGeometry: any = null;
  private _capsuleGeometry: any = null;

  private _physXPhysics: PhysXPhysics;
  private _physXManager: PhysXPhysicsManager;
  private _pxRaycastHit: any;
  private _pxFilterData: any;

  private _pxScene: any;
  private _physXSimulationCallbackInstance: any;

  private readonly _onContactEnter?: (collision: ICollision) => void;
  private readonly _onContactExit?: (collision: ICollision) => void;
  private readonly _onContactStay?: (collision: ICollision) => void;
  private readonly _onTriggerEnter?: (index1: number, index2: number) => void;
  private readonly _onTriggerExit?: (index1: number, index2: number) => void;
  private readonly _onTriggerStay?: (index1: number, index2: number) => void;

  private _currentEvents: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();

  private _eventPool: TriggerEvent[] = [];

  constructor(
    physXPhysics: PhysXPhysics,
    physicsManager: PhysXPhysicsManager,
    onContactEnter?: (collision: ICollision) => void,
    onContactExit?: (collision: ICollision) => void,
    onContactStay?: (collision: ICollision) => void,
    onTriggerEnter?: (obj1: number, obj2: number) => void,
    onTriggerExit?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ) {
    this._physXPhysics = physXPhysics;
    this._physXManager = physicsManager;

    const physX = physXPhysics._physX;

    this._pxRaycastHit = new physX.PxRaycastHit();
    this._pxFilterData = new physX.PxQueryFilterData();
    this._pxFilterData.flags = new physX.PxQueryFlags(QueryFlag.STATIC | QueryFlag.DYNAMIC | QueryFlag.PRE_FILTER);

    this._onContactEnter = onContactEnter;
    this._onContactExit = onContactExit;
    this._onContactStay = onContactStay;
    this._onTriggerEnter = onTriggerEnter;
    this._onTriggerExit = onTriggerExit;
    this._onTriggerStay = onTriggerStay;

    const triggerCallback = {
      onContactBegin: (collision) => {
        this._onContactEnter(collision);
      },
      onContactEnd: (collision) => {
        this._onContactExit(collision);
      },
      onContactPersist: (collision) => {
        this._onContactStay(collision);
      },
      onTriggerBegin: (index1, index2) => {
        const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
        event.state = TriggerEventState.Enter;
        this._currentEvents.add(event);
      },
      onTriggerEnd: (index1, index2) => {
        let event: TriggerEvent;
        if (index1 < index2) {
          const subMap = this._physXManager._eventMap[index1];
          event = subMap[index2];
          subMap[index2] = undefined;
        } else {
          const subMap = this._physXManager._eventMap[index2];
          event = subMap[index1];
          subMap[index1] = undefined;
        }
        event.state = TriggerEventState.Exit;
      }
    };

    const pxPhysics = physXPhysics._pxPhysics;
    this._physXSimulationCallbackInstance = physX.PxSimulationEventCallback.implement(triggerCallback);
    const sceneDesc = physX.getDefaultSceneDesc(
      pxPhysics.getTolerancesScale(),
      0,
      this._physXSimulationCallbackInstance
    );
    this._pxScene = pxPhysics.createScene(sceneDesc);
    sceneDesc.delete();
  }

  /**
   * {@inheritDoc IPhysicsScene.setGravity }
   */
  setGravity(value: Vector3) {
    this._pxScene.setGravity(value);
  }

  /**
   * {@inheritDoc IPhysicsScene.addCollider }
   */
  addCollider(collider: PhysXCollider): void {
    collider._scene = this;
    this._pxScene.addActor(collider._pxActor, null);
    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._addColliderShape(shapes[i]._id);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.removeCollider }
   */
  removeCollider(collider: PhysXCollider): void {
    collider._scene = null;
    this._pxScene.removeActor(collider._pxActor, true);
    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeColliderShape(shapes[i]._id);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.addCharacterController }
   */
  addCharacterController(characterController: PhysXCharacterController): void {
    characterController._scene = this;

    // Physx have no API to remove/readd cct into scene.
    if (!characterController._pxController) {
      const shape = characterController._shape;
      if (shape) {
        const lastPXManager = characterController._pxManager;
        if (lastPXManager !== this) {
          lastPXManager && characterController._destroyPXController();
          characterController._createPXController(this, shape);
        }
        this._addColliderShape(shape._id);
      }
    }
    characterController._pxManager = this;
  }

  /**
   * {@inheritDoc IPhysicsScene.removeCharacterController }
   */
  removeCharacterController(characterController: PhysXCharacterController): void {
    characterController._scene = null;
    characterController._pxManager = null;
    characterController._destroyPXController();
    const shape = characterController._shape;
    shape && this._removeColliderShape(shape._id);
  }

  /**
   * {@inheritDoc IPhysicsScene.update }
   */
  update(elapsedTime: number): void {
    this._simulate(elapsedTime);
    this._fetchResults();
    this._fireEvent();
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
    const { _pxRaycastHit: pxHitResult } = this;
    distance = Math.min(distance, 3.4e38); // float32 max value limit in physX raycast.

    const raycastCallback = {
      preFilter: (filterData, index, actor) => {
        if (onRaycast(index)) {
          return 2; // eBLOCK
        } else {
          return 0; // eNONE
        }
      }
    };

    const pxRaycastCallback = this._physXPhysics._physX.PxQueryFilterCallback.implement(raycastCallback);
    const result = this._pxScene.raycastSingle(
      ray.origin,
      ray.direction,
      distance,
      pxHitResult,
      this._pxFilterData,
      pxRaycastCallback
    );

    pxRaycastCallback.delete();

    if (result && hit != undefined) {
      const { _tempPosition: position, _tempNormal: normal } = PhysXPhysicsScene;
      const { position: pxPosition, normal: pxNormal } = pxHitResult;
      position.set(pxPosition.x, pxPosition.y, pxPosition.z);
      normal.set(pxNormal.x, pxNormal.y, pxNormal.z);

      hit(pxHitResult.getShape().getUUID(), pxHitResult.distance, position, normal);
    }
    return result;
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
    if (!this._boxGeometry) {
      this._boxGeometry = new this._physXPhysics._physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    } else {
      this._boxGeometry.halfExtents = halfExtents;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._sweepSingle(this._boxGeometry, pose, direction, distance, onSweep, outHitResult);
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
    if (!this._sphereGeometry) {
      this._sphereGeometry = new this._physXPhysics._physX.PxSphereGeometry(radius);
    } else {
      this._sphereGeometry.radius = radius;
    }

    const tempQuat = PhysXPhysicsScene._tempQuaternion;
    tempQuat.set(0, 0, 0, 1); // Identity quaternion
    const pose = { translation: center, rotation: tempQuat };
    return this._sweepSingle(this._sphereGeometry, pose, direction, distance, onSweep, outHitResult);
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
    if (!this._capsuleGeometry) {
      this._capsuleGeometry = new this._physXPhysics._physX.PxCapsuleGeometry(radius, height * 0.5);
    } else {
      this._capsuleGeometry.radius = radius;
      this._capsuleGeometry.halfHeight = height * 0.5;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._sweepSingle(this._capsuleGeometry, pose, direction, distance, onSweep, outHitResult);
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
    if (!this._boxGeometry) {
      this._boxGeometry = new this._physXPhysics._physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    } else {
      this._boxGeometry.halfExtents = halfExtents;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._overlapMultiple(this._boxGeometry, pose, onOverlap);
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapSphereAll }
   */
  overlapSphereAll(center: Vector3, radius: number, onOverlap: (obj: number) => boolean): number[] {
    if (!this._sphereGeometry) {
      this._sphereGeometry = new this._physXPhysics._physX.PxSphereGeometry(radius);
    } else {
      this._sphereGeometry.radius = radius;
    }

    const tempQuat = PhysXPhysicsScene._tempQuaternion;
    tempQuat.set(0, 0, 0, 1);
    const pose = { translation: center, rotation: tempQuat };
    return this._overlapMultiple(this._sphereGeometry, pose, onOverlap);
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
    if (!this._capsuleGeometry) {
      this._capsuleGeometry = new this._physXPhysics._physX.PxCapsuleGeometry(radius, height * 0.5);
    } else {
      this._capsuleGeometry.radius = radius;
      this._capsuleGeometry.halfHeight = height * 0.5;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._overlapMultiple(this._capsuleGeometry, pose, onOverlap);
  }

  /**
   * {@inheritDoc IPhysicsScene.destroy }
   */
  destroy(): void {
    this._boxGeometry?.delete();
    this._sphereGeometry?.delete();
    this._capsuleGeometry?.delete();

    this._physXSimulationCallbackInstance.delete();
    this._pxRaycastHit.delete();
    this._pxFilterData.flags.delete();
    this._pxFilterData.delete();
    // Need to release the controller manager before release the scene.
    this._pxControllerManager?.release();
    this._pxScene.release();
  }

  /**
   * @internal
   */
  _getControllerManager(): any {
    let pxControllerManager = this._pxControllerManager;
    if (pxControllerManager === null) {
      this._pxControllerManager = pxControllerManager = this._pxScene.createControllerManager();
    }
    return pxControllerManager;
  }

  /**
   * @internal
   */
  _addColliderShape(id: number) {
    this._physXManager._eventMap[id] = Object.create(null);
  }

  /**
   * @internal
   */
  _removeColliderShape(id: number) {
    const { _eventPool: eventPool, _currentEvents: currentEvents } = this;
    const { _eventMap: eventMap } = this._physXManager;
    currentEvents.forEach((event, i) => {
      if (event.index1 == id) {
        currentEvents.deleteByIndex(i);
        eventPool.push(event);
      } else if (event.index2 == id) {
        currentEvents.deleteByIndex(i);
        eventPool.push(event);
        // If the shape is big index, should clear from the small index shape subMap
        eventMap[event.index1][id] = undefined;
      }
    });
    delete eventMap[id];
  }

  private _sweepSingle(
    geometry: any,
    pose: { translation: Vector3; rotation: Quaternion },
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    distance = Math.min(distance, 3.4e38); // float32 max value limit in physx sweep

    const sweepCallback = {
      preFilter: (filterData, index, actor) => {
        if (onSweep(index)) {
          return 2; // eBLOCK
        } else {
          return 0; // eNONE
        }
      }
    };

    const pxSweepCallback = this._physXPhysics._physX.PxQueryFilterCallback.implement(sweepCallback);
    const pxSweepHit = new this._physXPhysics._physX.PxSweepHit();
    const result = this._pxScene.sweepSingle(
      geometry,
      pose,
      direction,
      distance,
      pxSweepHit,
      this._pxFilterData,
      pxSweepCallback
    );

    if (result && outHitResult != undefined) {
      const { _tempPosition: position, _tempNormal: normal } = PhysXPhysicsScene;
      const { position: pxPosition, normal: pxNormal } = pxSweepHit;
      position.set(pxPosition.x, pxPosition.y, pxPosition.z);
      normal.set(pxNormal.x, pxNormal.y, pxNormal.z);
      outHitResult(pxSweepHit.getShape().getUUID(), pxSweepHit.distance, position, normal);
    }

    pxSweepCallback.delete();
    pxSweepHit.delete();

    return result;
  }

  private _overlapMultiple(
    geometry: any,
    pose: { translation: Vector3; rotation: Quaternion },
    onOverlap: (obj: number) => boolean
  ): number[] {
    const overlapCallback = {
      preFilter: (filterData, index, actor) => (onOverlap(index) ? 2 : 0)
    };

    const pxOverlapCallback = this._physXPhysics._physX.PxQueryFilterCallback.implement(overlapCallback);
    const maxHits = 256;
    const hits: any = (this._pxScene as any).overlapMultiple(
      geometry,
      pose,
      maxHits,
      this._pxFilterData,
      pxOverlapCallback
    );

    const result = PhysXPhysicsScene._tempShapeIDs;
    result.length = 0;
    if (hits) {
      // PhysX overlapMultiple returns a collection with size() method
      for (let i = 0, n = hits.size(); i < n; i++) {
        result.push(hits.get(i).getShape().getUUID());
      }
    }

    pxOverlapCallback.delete();
    hits?.delete();
    return result;
  }

  private _simulate(elapsedTime: number): void {
    this._pxScene.simulate(elapsedTime, true);
  }

  private _fetchResults(block: boolean = true): void {
    this._pxScene.fetchResults(block);
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    let event: TriggerEvent;
    if (this._eventPool.length) {
      event = this._eventPool.pop();
      event.index1 = index1;
      event.index2 = index2;
    } else {
      event = new TriggerEvent(index1, index2);
    }
    this._physXManager._eventMap[index1][index2] = event;
    return event;
  }

  private _fireEvent(): void {
    const { _eventPool: eventPool, _currentEvents: currentEvents } = this;
    currentEvents.forEach((event, i) => {
      if (event.state == TriggerEventState.Enter) {
        this._onTriggerEnter(event.index1, event.index2);
        event.state = TriggerEventState.Stay;
      } else if (event.state == TriggerEventState.Stay) {
        this._onTriggerStay(event.index1, event.index2);
      } else if (event.state == TriggerEventState.Exit) {
        currentEvents.deleteByIndex(i);
        this._onTriggerExit(event.index1, event.index2);
        eventPool.push(event);
      }
    });
  }
}

/**
 * Filtering flags for scene queries.
 */
enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  PRE_FILTER = 1 << 2,
  POST_FILTER = 1 << 3,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
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
export class TriggerEvent {
  state: TriggerEventState;
  index1: number;
  index2: number;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}
