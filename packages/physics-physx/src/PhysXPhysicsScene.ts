import { Vector3, DisorderedArray, Quaternion } from "@galacean/engine";
import { IPhysicsScene, IPhysicsEvents, IContactEvent, ITriggerEvent } from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";

/**
 * Simulates colliders and runs scene queries through PhysX.
 */
export class PhysXPhysicsScene implements IPhysicsScene {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _tempPose: { translation: Vector3; rotation: Quaternion } = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };

  /** @internal */
  _pxControllerManager: any = null;

  private _boxGeometry: any = null;
  private _sphereGeometry: any = null;
  private _capsuleGeometry: any = null;

  private _physXPhysics: PhysXPhysics;
  private _physXManager: PhysXPhysicsManager;
  private _pxScene: any;
  private _pxSceneQueries: any;
  private _physXSimulationCallbackInstance: any;

  private _activeTriggers: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private _contactEvents: ContactEvent[] = [];
  private _contactEventCount = 0;
  private _triggerEvents: TriggerEvent[] = [];
  private _physicsEvents: IPhysicsEvents = { contactEvents: [], contactEventCount: 0, triggerEvents: [] };

  private _triggerEventPool: TriggerEvent[] = [];

  /**
   * Creates a PhysX scene with buffered collision and trigger events.
   * @param physXPhysics - The native physics implementation
   * @param physicsManager - The manager that tracks collider pairs
   */
  constructor(physXPhysics: PhysXPhysics, physicsManager: PhysXPhysicsManager) {
    this._physXPhysics = physXPhysics;
    this._physXManager = physicsManager;

    const physX = physXPhysics._physX;

    const simulationCallback = {
      onContactBegin: (shape0ID: number, shape1ID: number, contacts: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, contacts, PhysicsEventState.Enter);
      },
      onContactEnd: (shape0ID: number, shape1ID: number, contacts: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, contacts, PhysicsEventState.Exit);
      },
      onContactPersist: (shape0ID: number, shape1ID: number, contacts: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, contacts, PhysicsEventState.Stay);
      },
      onTriggerBegin: (index1, index2) => {
        const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
        event.state = PhysicsEventState.Enter;
        this._activeTriggers.add(event);
      },
      onTriggerEnd: (index1, index2) => {
        let event: TriggerEvent;
        if (index1 < index2) {
          const subMap = this._physXManager._eventMap[index1];
          event = subMap[index2]!;
          subMap[index2] = undefined;
        } else {
          const subMap = this._physXManager._eventMap[index2];
          event = subMap[index1]!;
          subMap[index1] = undefined;
        }
        event.state = PhysicsEventState.Exit;
      }
    };

    const pxPhysics = physXPhysics._pxPhysics;
    this._physXSimulationCallbackInstance = physX.PxSimulationEventCallback.implement(simulationCallback);
    const sceneDesc = physX.getDefaultSceneDesc(
      pxPhysics.getTolerancesScale(),
      0,
      this._physXSimulationCallbackInstance
    );
    this._pxScene = pxPhysics.createScene(sceneDesc);
    sceneDesc.delete();

    this._pxSceneQueries = new physX.PxSceneQueries(this._pxScene);
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
    this._contactEventCount = 0;
    this._simulate(elapsedTime);
    this._fetchResults();
  }

  /**
   * {@inheritDoc IPhysicsScene.setContactEventEnabled }
   */
  setContactEventEnabled(enabled: boolean): void {
    this._physXPhysics._physX.setContactEventEnabled(this._physXSimulationCallbackInstance, enabled);
    if (!enabled) {
      this._contactEventCount = 0;
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.updateEvents }
   */
  updateEvents(): IPhysicsEvents {
    const physicsEvents = this._physicsEvents;

    // Collect trigger events: snapshot state for dispatch, then advance
    const {
      _triggerEventPool: triggerEventPool,
      _activeTriggers: activeTriggers,
      _triggerEvents: triggerEvents
    } = this;
    triggerEvents.length = 0;
    activeTriggers.forEach((event, i) => {
      event.dispatchState = event.state;
      triggerEvents.push(event);
      if (event.state === PhysicsEventState.Enter) {
        event.state = PhysicsEventState.Stay;
      } else if (event.state === PhysicsEventState.Exit) {
        activeTriggers.deleteByIndex(i);
        triggerEventPool.push(event);
      }
    });

    physicsEvents.contactEvents = this._contactEvents;
    physicsEvents.contactEventCount = this._contactEventCount;
    physicsEvents.triggerEvents = triggerEvents;
    return physicsEvents;
  }

  /**
   * {@inheritDoc IPhysicsScene.raycast }
   */
  raycast(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    hit?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const hits: Float64Array = this._pxSceneQueries.raycast(origin, direction, Math.min(distance, 3.4e38), layerMask);
    if (hits.length === 0) {
      return false;
    }
    if (hit) {
      this._readHit(hits, 0, hit);
    }
    return true;
  }

  /**
   * {@inheritDoc IPhysicsScene.raycastAll }
   */
  raycastAll(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    onHit: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): void {
    // Keep the values stable if a hit callback starts another query
    const hits: Float64Array = this._pxSceneQueries
      .raycastAll(origin, direction, Math.min(distance, 3.4e38), layerMask)
      .slice();
    for (let i = 0; i < hits.length; i += 8) {
      this._readHit(hits, i, onHit);
    }
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
    layerMask: number,
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
    return this._sweepSingle(this._boxGeometry, pose, direction, distance, layerMask, outHitResult);
  }

  /**
   * {@inheritDoc IPhysicsScene.sphereCast }
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    if (!this._sphereGeometry) {
      this._sphereGeometry = new this._physXPhysics._physX.PxSphereGeometry(radius);
    } else {
      this._sphereGeometry.radius = radius;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.set(0, 0, 0, 1);
    return this._sweepSingle(this._sphereGeometry, pose, direction, distance, layerMask, outHitResult);
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
    layerMask: number,
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
    return this._sweepSingle(this._capsuleGeometry, pose, direction, distance, layerMask, outHitResult);
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapBoxAll }
   */
  overlapBoxAll(center: Vector3, orientation: Quaternion, halfExtents: Vector3, layerMask: number): Uint32Array {
    if (!this._boxGeometry) {
      this._boxGeometry = new this._physXPhysics._physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    } else {
      this._boxGeometry.halfExtents = halfExtents;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._pxSceneQueries.overlap(this._boxGeometry, pose, layerMask);
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapSphereAll }
   */
  overlapSphereAll(center: Vector3, radius: number, layerMask: number): Uint32Array {
    if (!this._sphereGeometry) {
      this._sphereGeometry = new this._physXPhysics._physX.PxSphereGeometry(radius);
    } else {
      this._sphereGeometry.radius = radius;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.set(0, 0, 0, 1);
    return this._pxSceneQueries.overlap(this._sphereGeometry, pose, layerMask);
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapCapsuleAll }
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    layerMask: number
  ): Uint32Array {
    if (!this._capsuleGeometry) {
      this._capsuleGeometry = new this._physXPhysics._physX.PxCapsuleGeometry(radius, height * 0.5);
    } else {
      this._capsuleGeometry.radius = radius;
      this._capsuleGeometry.halfHeight = height * 0.5;
    }

    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._pxSceneQueries.overlap(this._capsuleGeometry, pose, layerMask);
  }

  /**
   * {@inheritDoc IPhysicsScene.gc }
   */
  gc(): void {
    this._contactEvents.length = this._contactEventCount;
  }

  /**
   * {@inheritDoc IPhysicsScene.destroy }
   */
  destroy(): void {
    this._boxGeometry?.delete();
    this._sphereGeometry?.delete();
    this._capsuleGeometry?.delete();

    this._physXSimulationCallbackInstance.delete();
    this._pxSceneQueries.delete();
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
    const { _triggerEventPool: triggerEventPool, _activeTriggers: activeTriggers } = this;
    const { _eventMap: eventMap } = this._physXManager;
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

  private _readHit(
    hits: Float64Array,
    offset: number,
    onHit: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): void {
    const { _tempPosition: position, _tempNormal: normal } = PhysXPhysicsScene;
    position.set(hits[offset + 2], hits[offset + 3], hits[offset + 4]);
    normal.set(hits[offset + 5], hits[offset + 6], hits[offset + 7]);
    onHit(hits[offset], hits[offset + 1], position, normal);
  }

  private _sweepSingle(
    geometry: any,
    pose: { translation: Vector3; rotation: Quaternion },
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const hits: Float64Array = this._pxSceneQueries.sweep(
      geometry,
      pose,
      direction,
      Math.min(distance, 3.4e38),
      layerMask
    );
    if (hits.length === 0) {
      return false;
    }
    if (outHitResult) {
      this._readHit(hits, 0, outHitResult);
    }
    return true;
  }

  private _simulate(elapsedTime: number): void {
    this._pxScene.simulate(elapsedTime, true);
  }

  private _fetchResults(block: boolean = true): void {
    this._pxScene.fetchResults(block);
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    let event: TriggerEvent | undefined;
    if (this._triggerEventPool.length) {
      event = this._triggerEventPool.pop()!;
      event.index1 = index1;
      event.index2 = index2;
    } else {
      event = new TriggerEvent(index1, index2);
    }
    this._physXManager._eventMap[index1][index2] = event;
    return event;
  }

  private _bufferContactEvent(shape0ID: number, shape1ID: number, contacts: Float32Array, state: number): void {
    const index = this._contactEventCount++;
    const event = (this._contactEvents[index] ||= new ContactEvent());
    event.shape0Id = shape0ID;
    event.shape1Id = shape1ID;
    event.state = state;

    // Copy the borrowed native values before the next contact pair reuses the buffer
    const bufferedContacts = event._bufferedContacts;
    const count = (bufferedContacts.contactCount = contacts.length / 10);
    for (let i = 0; i < count; i++) {
      const offset = i * 10;
      const contact = (bufferedContacts.contacts[i] ||= new BufferedContactPoint());
      contact.position.set(contacts[offset], contacts[offset + 1], contacts[offset + 2]);
      contact.normal.set(contacts[offset + 3], contacts[offset + 4], contacts[offset + 5]);
      contact.impulse.set(contacts[offset + 6], contacts[offset + 7], contacts[offset + 8]);
      contact.separation = contacts[offset + 9];
    }
  }
}

enum PhysicsEventState {
  Enter = 0,
  Stay = 1,
  Exit = 2
}

/**
 * Trigger event to store interactive object ids and state.
 */
export class TriggerEvent implements ITriggerEvent {
  state: number;
  dispatchState: number;
  index1: number;
  index2: number;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}

/**
 * Buffered contact point data, copied from PhysX during fetchResults.
 */
class BufferedContactPoint {
  position = new Vector3();
  normal = new Vector3();
  impulse = new Vector3();
  separation = 0;
}

/**
 * Contact points retained for a buffered collision event.
 */
class BufferedContacts {
  contactCount = 0;
  contacts: BufferedContactPoint[] = [];

  size(): number {
    return this.contactCount;
  }

  get(index: number): BufferedContactPoint {
    return this.contacts[index];
  }
}

class ContactEvent implements IContactEvent {
  state: number;
  shape0Id: number;
  shape1Id: number;

  /** @internal */
  _bufferedContacts = new BufferedContacts();

  get contactCount(): number {
    return this._bufferedContacts.contactCount;
  }

  getContacts(): BufferedContacts {
    return this._bufferedContacts;
  }
}
