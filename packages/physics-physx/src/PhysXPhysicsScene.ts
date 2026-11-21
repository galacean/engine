import { Vector3, DisorderedArray, Quaternion } from "@galacean/engine";
import {
  IPhysicsScene,
  IPhysicsEvents,
  IContactEvent,
  ITriggerEvent,
  PhysicsEventState
} from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";

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
  private _pxScene: any;
  private _pxSceneQueries: any;
  private _physXSimulationCallbackInstance: any;

  private _activeTriggers: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private readonly _physicsEvents = {
    contactEvents: [] as ContactEvent[],
    contactEventCount: 0,
    triggerEvents: [] as TriggerEvent[]
  };

  private _triggerEventPool: TriggerEvent[] = [];
  // Trigger pairs are scene-local: only shapes on actors of this scene can form a pair
  private _eventMap: Record<number, Record<number, TriggerEvent | undefined>> = Object.create(null);
  private _shapeChanges = new Map<number, boolean>();

  /**
   * Creates a PhysX scene with buffered collision and trigger events.
   * @param physXPhysics - The native physics implementation
   */
  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;

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
        const small = Math.min(index1, index2);
        const big = Math.max(index1, index2);
        const pairs = (this._eventMap[small] ||= Object.create(null));
        const existing = pairs[big];
        if (existing) {
          // Found again after the shape was removed and added back: the overlap continues
          existing.state = PhysicsEventState.Stay;
          return;
        }
        let event = this._triggerEventPool.pop();
        if (event) {
          event.index1 = small;
          event.index2 = big;
        } else {
          event = new TriggerEvent(small, big);
        }
        event.state = PhysicsEventState.Enter;
        pairs[big] = event;
        this._activeTriggers.add(event);
      },
      onTriggerEnd: (index1, index2) => {
        const pairs = this._eventMap[Math.min(index1, index2)];
        const big = Math.max(index1, index2);
        pairs[big]!.state = PhysicsEventState.Exit;
        delete pairs[big];
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
    characterController._addToScene(this);
  }

  /**
   * {@inheritDoc IPhysicsScene.removeCharacterController }
   */
  removeCharacterController(characterController: PhysXCharacterController): void {
    characterController._removeFromScene();
  }

  /**
   * {@inheritDoc IPhysicsScene.update }
   */
  update(elapsedTime: number): void {
    this._physicsEvents.contactEventCount = 0;
    this._syncTriggerPairs();
    const scene = this._pxScene;
    scene.simulate(elapsedTime, true);
    scene.fetchResults(true);
  }

  /**
   * {@inheritDoc IPhysicsScene.setContactEventEnabled }
   */
  setContactEventEnabled(enabled: boolean): void {
    this._physXPhysics._physX.setContactEventEnabled(this._physXSimulationCallbackInstance, enabled);
    if (!enabled) {
      this._physicsEvents.contactEventCount = 0;
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.updateEvents }
   */
  updateEvents(): IPhysicsEvents {
    const physicsEvents = this._physicsEvents;
    const triggerEvents = physicsEvents.triggerEvents;
    const activeTriggers = this._activeTriggers;
    const elements = activeTriggers._elements;
    triggerEvents.length = 0;
    activeTriggers._startLoop();
    try {
      for (let i = 0, n = activeTriggers.length; i < n; i++) {
        const event = elements[i];
        const state = (event.dispatchState = event.state);
        triggerEvents.push(event);
        if (state === PhysicsEventState.Enter) {
          event.state = PhysicsEventState.Stay;
        } else if (state === PhysicsEventState.Exit) {
          this._retireTrigger(event, i);
        }
      }
    } finally {
      activeTriggers._endLoop(undefined);
    }
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
    return this._sweepSingle(
      this._getBoxGeometry(halfExtents),
      PhysXPhysicsScene._queryPose(center, orientation),
      direction,
      distance,
      layerMask,
      outHitResult
    );
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
    return this._sweepSingle(
      this._getSphereGeometry(radius),
      PhysXPhysicsScene._queryPose(center),
      direction,
      distance,
      layerMask,
      outHitResult
    );
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
    return this._sweepSingle(
      this._getCapsuleGeometry(radius, height),
      PhysXPhysicsScene._queryPose(center, orientation),
      direction,
      distance,
      layerMask,
      outHitResult
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapBoxAll }
   */
  overlapBoxAll(center: Vector3, orientation: Quaternion, halfExtents: Vector3, layerMask: number): Uint32Array {
    return this._pxSceneQueries.overlap(
      this._getBoxGeometry(halfExtents),
      PhysXPhysicsScene._queryPose(center, orientation),
      layerMask
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapSphereAll }
   */
  overlapSphereAll(center: Vector3, radius: number, layerMask: number): Uint32Array {
    return this._pxSceneQueries.overlap(
      this._getSphereGeometry(radius),
      PhysXPhysicsScene._queryPose(center),
      layerMask
    );
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
    return this._pxSceneQueries.overlap(
      this._getCapsuleGeometry(radius, height),
      PhysXPhysicsScene._queryPose(center, orientation),
      layerMask
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.gc }
   */
  gc(): void {
    const { contactEvents, contactEventCount } = this._physicsEvents;
    contactEvents.length = contactEventCount;
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
  _addColliderShape(id: number): void {
    const changes = this._shapeChanges;
    if (changes.has(id)) {
      changes.set(id, true);
    }
  }

  /**
   * @internal
   * Its active trigger pairs end in the next step unless the id is added back before it, as when a Collider moves to
   * another actor or rebuilds its shape, and PhysX finds them again. Pairs of an id that is not added back end silently.
   */
  _removeColliderShape(id: number): void {
    this._shapeChanges.set(id, false);
  }

  private _getBoxGeometry(halfExtents: Vector3): any {
    const geometry = this._boxGeometry;
    if (geometry) {
      geometry.halfExtents = halfExtents;
      return geometry;
    }
    const { x, y, z } = halfExtents;
    return (this._boxGeometry = new this._physXPhysics._physX.PxBoxGeometry(x, y, z));
  }

  private _getSphereGeometry(radius: number): any {
    const geometry = this._sphereGeometry;
    if (geometry) {
      geometry.radius = radius;
      return geometry;
    }
    return (this._sphereGeometry = new this._physXPhysics._physX.PxSphereGeometry(radius));
  }

  private _getCapsuleGeometry(radius: number, height: number): any {
    const geometry = this._capsuleGeometry;
    const halfHeight = height * 0.5;
    if (geometry) {
      geometry.radius = radius;
      geometry.halfHeight = halfHeight;
      return geometry;
    }
    return (this._capsuleGeometry = new this._physXPhysics._physX.PxCapsuleGeometry(radius, halfHeight));
  }

  private static _queryPose(center: Vector3, orientation?: Quaternion): { translation: Vector3; rotation: Quaternion } {
    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    const rotation = pose.rotation.set(0, 0, 0, 1);
    if (orientation) Quaternion.normalize(orientation, rotation);
    return pose;
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

  private _syncTriggerPairs(): void {
    const changes = this._shapeChanges;
    if (changes.size === 0) {
      return;
    }
    const activeTriggers = this._activeTriggers;
    const elements = activeTriggers._elements;
    activeTriggers._startLoop();
    try {
      for (let i = 0, n = activeTriggers.length; i < n; i++) {
        const event = elements[i];
        const first = changes.get(event.index1);
        const second = changes.get(event.index2);
        if (first === false || second === false) {
          this._retireTrigger(event, i);
        } else if (first || second) {
          // PhysX can find the reattached pair again and turn this exit into a stay.
          event.state = PhysicsEventState.Exit;
        }
      }
    } finally {
      activeTriggers._endLoop(undefined);
    }
    changes.forEach(this._forgetRemovedShape);
    changes.clear();
  }

  private readonly _forgetRemovedShape = (present: boolean, id: number): void => {
    if (!present) delete this._eventMap[id];
  };

  private _retireTrigger(event: TriggerEvent, index: number): void {
    this._activeTriggers.deleteByIndex(index);
    this._triggerEventPool.push(event);
    const pairs = this._eventMap[event.index1];
    if (pairs[event.index2] === event) delete pairs[event.index2];
  }

  private _bufferContactEvent(
    shape0ID: number,
    shape1ID: number,
    contacts: Float32Array,
    state: PhysicsEventState
  ): void {
    const events = this._physicsEvents;
    const index = events.contactEventCount++;
    const event = (events.contactEvents[index] ||= new ContactEvent());
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

/**
 * Trigger event to store interactive object ids and state.
 */
class TriggerEvent implements ITriggerEvent {
  state: PhysicsEventState;
  dispatchState: PhysicsEventState;

  constructor(
    public index1: number,
    public index2: number
  ) {}
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
  state: PhysicsEventState;
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
