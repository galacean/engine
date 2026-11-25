import { Vector3, Quaternion } from "@galacean/engine";
import {
  IContactEvent,
  IContactPoint,
  IFixedJoint,
  IHingeJoint,
  IPhysicsEvents,
  IPhysicsScene,
  ISpringJoint,
  ITriggerEvent,
  PhysicsEventState
} from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXActor } from "./PhysXActor";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXFixedJoint } from "./joint/PhysXFixedJoint";
import { PhysXHingeJoint } from "./joint/PhysXHingeJoint";
import { PhysXSpringJoint } from "./joint/PhysXSpringJoint";
import { PhysXShape } from "./shape/PhysXShape";

/**
 * Simulates actors and runs scene queries through PhysX.
 */
export class PhysXPhysicsScene implements IPhysicsScene {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _tempPose: { translation: Vector3; rotation: Quaternion } = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };

  private static _queryPose(
    center: Vector3,
    orientation?: Quaternion,
    axis?: Quaternion
  ): { translation: Vector3; rotation: Quaternion } {
    const pose = PhysXPhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    const rotation = pose.rotation;
    if (orientation) {
      if (axis) {
        Quaternion.multiply(orientation, axis, rotation);
      } else {
        rotation.copyFrom(orientation);
      }
      rotation.normalize();
    } else {
      rotation.set(0, 0, 0, 1);
    }
    return pose;
  }

  private static _applyShapeChange(this: PhysXPhysicsScene, change: ShapeChange, id: number): void {
    if (change === ShapeChange.Removed) {
      delete this._eventMap[id];
      return;
    }
    const neighbors = this._activeContacts.get(id);
    if (!neighbors) return;
    this._iterShapeId = id;
    neighbors.forEach(PhysXPhysicsScene._queuePendingReplacedContact, this);
  }

  private static _removeContactNeighbor(this: PhysXPhysicsScene, otherId: number): void {
    this._deleteContactNeighbor(this._activeContacts, otherId, this._iterShapeId);
  }

  private static _queuePendingReplacedContact(this: PhysXPhysicsScene, otherId: number): void {
    const id = this._iterShapeId;
    const small = id < otherId ? id : otherId;
    const big = id < otherId ? otherId : id;
    const pending = this._pendingReplacedContacts;
    (pending.get(small) ?? this._acquireContactSet(pending, small)).add(big);
  }

  private static _flushPendingReplacedSet(this: PhysXPhysicsScene, set: Set<number>, small: number): void {
    this._iterShapeId = small;
    set.forEach(PhysXPhysicsScene._flushPendingReplacedPair, this);
    set.clear();
    this._contactSetPool.push(set);
  }

  private static _flushPendingReplacedPair(this: PhysXPhysicsScene, big: number): void {
    const small = this._iterShapeId;
    this._removeActiveContact(small, big);
    this._bufferContactEvent(small, big, 0, null, PhysicsEventState.Exit);
  }

  /** @internal */
  _contactData?: Float32Array;

  private _pxControllerManager: any = null;
  private _boxGeometry: any = null;
  private _sphereGeometry: any = null;
  private _capsuleGeometry: any = null;

  private _physXPhysics: PhysXPhysics;
  private _pxScene: any;
  private _pxSceneQueries: any;
  private _physXSimulationCallbackInstance: any;

  private _contactFloatOffset = 0;
  private _iterShapeId = 0;

  private _activeTriggers: TriggerEvent[] = [];
  private readonly _physicsEvents = {
    contactEvents: [] as ContactEvent[],
    contactEventCount: 0,
    triggerEvents: [] as TriggerEvent[]
  };

  private _triggerEventPool: TriggerEvent[] = [];
  private _contactSetPool: Set<number>[] = [];
  private _raycastBuffers?: Float64Array[];
  // Store each scene-local pair under its two collider IDs in ascending order.
  private _eventMap: Record<number, Record<number, TriggerEvent | undefined>> = Object.create(null);
  private _shapeChanges = new Map<number, ShapeChange>();
  // Active solid contact adjacency by collider ID while contact events are enabled.
  private _activeContacts = new Map<number, Set<number>>();
  // Canonical (small -> Set<big>) pairs from replaced shapes awaiting re-contact or synthetic exit.
  private _pendingReplacedContacts = new Map<number, Set<number>>();

  /**
   * Creates a PhysX scene with buffered collision and trigger events.
   * @param physXPhysics - The native physics implementation
   */
  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;

    const physX = physXPhysics._physX;

    const simulationCallback = {
      onContactBegin: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        const state = this._consumePendingReplacedContact(shape0ID, shape1ID)
          ? PhysicsEventState.Stay
          : PhysicsEventState.Enter;
        state === PhysicsEventState.Enter && this._addActiveContact(shape0ID, shape1ID);
        this._bufferContactEvent(shape0ID, shape1ID, count, data, state);
      },
      onContactEnd: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        this._removeActiveContact(shape0ID, shape1ID);
        this._consumePendingReplacedContact(shape0ID, shape1ID);
        this._bufferContactEvent(shape0ID, shape1ID, count, data, PhysicsEventState.Exit);
      },
      onContactPersist: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        this._addActiveContact(shape0ID, shape1ID);
        this._bufferContactEvent(shape0ID, shape1ID, count, data, PhysicsEventState.Stay);
      },
      onTriggerBegin: (shape0ID: number, shape1ID: number) => {
        const small = Math.min(shape0ID, shape1ID);
        const big = Math.max(shape0ID, shape1ID);
        const pairs = (this._eventMap[small] ||= Object.create(null));
        const existing = pairs[big];
        if (existing) {
          // Treat a rediscovered pair as a continuous overlap.
          existing._pendingState = PhysicsEventState.Stay;
          return;
        }
        let event = this._triggerEventPool.pop();
        if (event) {
          event.shape0Id = small;
          event.shape1Id = big;
        } else {
          event = new TriggerEvent(small, big);
        }
        event._pendingState = PhysicsEventState.Enter;
        pairs[big] = event;
        this._activeTriggers.push(event);
      },
      onTriggerEnd: (shape0ID: number, shape1ID: number) => {
        const pairs = this._eventMap[Math.min(shape0ID, shape1ID)];
        const big = Math.max(shape0ID, shape1ID);
        pairs[big]!._pendingState = PhysicsEventState.Exit;
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
    sceneDesc.setKinematicPairs(true, true);
    this._pxScene = pxPhysics.createScene(sceneDesc);
    sceneDesc.delete();

    this._pxSceneQueries = new physX.PxSceneQueries(this._pxScene);
  }

  /**
   * {@inheritDoc IPhysicsScene.setGravity }
   */
  setGravity(value: Vector3): void {
    this._pxScene.setGravity(value);
  }

  /**
   * {@inheritDoc IPhysicsScene.addActor }
   */
  addActor(actor: PhysXActor): void {
    actor._scene = this;
    this._pxScene.addActor(actor._pxActor, null);
    const ids = actor._shapeIds;
    for (let i = 0, n = ids.length; i < n; i++) {
      this._addShape(ids[i]);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.removeActor }
   */
  removeActor(actor: PhysXActor): void {
    actor._scene = null;
    this._pxScene.removeActor(actor._pxActor, true);
    const ids = actor._shapeIds;
    for (let i = 0, n = ids.length; i < n; i++) {
      this._removeShape(ids[i]);
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
   * {@inheritDoc IPhysicsScene.createFixedJoint }
   */
  createFixedJoint(actor: PhysXActor): IFixedJoint {
    return new PhysXFixedJoint(this._physXPhysics, actor);
  }

  /**
   * {@inheritDoc IPhysicsScene.createHingeJoint }
   */
  createHingeJoint(actor: PhysXActor): IHingeJoint {
    return new PhysXHingeJoint(this._physXPhysics, actor);
  }

  /**
   * {@inheritDoc IPhysicsScene.createSpringJoint }
   */
  createSpringJoint(actor: PhysXActor): ISpringJoint {
    return new PhysXSpringJoint(this._physXPhysics, actor);
  }

  /**
   * {@inheritDoc IPhysicsScene.update }
   */
  update(elapsedTime: number): void {
    this._physicsEvents.contactEventCount = 0;
    this._contactFloatOffset = 0;
    this._syncShapeChanges();
    const scene = this._pxScene;
    scene.simulate(elapsedTime, true);
    scene.fetchResults(true);
    this._flushReplacedContactExits();
  }

  /**
   * {@inheritDoc IPhysicsScene.setContactEventEnabled }
   */
  setContactEventEnabled(enabled: boolean): void {
    if (!enabled) {
      this._activeContacts.clear();
    }
    this._pxScene.setContactEventEnabled(enabled);
  }

  /**
   * {@inheritDoc IPhysicsScene.updateEvents }
   */
  updateEvents(): IPhysicsEvents {
    const physicsEvents = this._physicsEvents;
    const triggerEvents = physicsEvents.triggerEvents;
    const activeTriggers = this._activeTriggers;
    let count = 0;
    for (let i = 0; i < activeTriggers.length; ) {
      const event = activeTriggers[i];
      const state = (event.state = event._pendingState);
      triggerEvents[count++] = event;
      if (state === PhysicsEventState.Enter) {
        event._pendingState = PhysicsEventState.Stay;
      } else if (state === PhysicsEventState.Exit) {
        this._retireTrigger(event, i);
        continue;
      }
      i++;
    }
    triggerEvents.length = count;
    return physicsEvents;
  }

  /**
   * {@inheritDoc IPhysicsScene.getColliderLayerCollision }
   */
  getColliderLayerCollision(layer1: number, layer2: number): boolean {
    return this._pxScene.getGroupCollisionFlag(layer1, layer2);
  }

  /**
   * {@inheritDoc IPhysicsScene.setColliderLayerCollision }
   */
  setColliderLayerCollision(layer1: number, layer2: number, isCollide: boolean): void {
    this._pxScene.setGroupCollisionFlag(layer1, layer2, isCollide);
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
    const hits: Float64Array = this._pxSceneQueries.raycast(
      origin,
      direction,
      Math.min(distance, 3.4e38),
      layerMask,
      true,
      null,
      false
    );
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
    const hits: Float64Array = this._pxSceneQueries.raycastAll(
      origin,
      direction,
      Math.min(distance, 3.4e38),
      layerMask,
      true,
      null,
      false
    );
    const length = hits.length;
    if (!length) return;
    const hitStride = 9;
    if (length === hitStride) {
      this._readHit(hits, 0, onHit);
      return;
    }

    // The first callback can overwrite unread hits by issuing another query.
    const buffers = (this._raycastBuffers ||= []);
    let buffer = buffers.pop();
    if (!buffer || buffer.length < length) {
      let nextLength = buffer ? buffer.length * 2 : 16 * hitStride;
      while (nextLength < length) nextLength *= 2;
      buffer = new Float64Array(nextLength);
    }
    buffer.set(hits);
    for (let i = 0; i < length; i += hitStride) {
      this._readHit(buffer, i, onHit);
    }
    buffers.push(buffer);
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
    halfHeight: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    return this._sweepSingle(
      this._getCapsuleGeometry(radius, halfHeight),
      PhysXPhysicsScene._queryPose(center, orientation, PhysXShape._yAxis),
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
      layerMask,
      true,
      null
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapSphereAll }
   */
  overlapSphereAll(center: Vector3, radius: number, layerMask: number): Uint32Array {
    return this._pxSceneQueries.overlap(
      this._getSphereGeometry(radius),
      PhysXPhysicsScene._queryPose(center),
      layerMask,
      true,
      null
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.overlapCapsuleAll }
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    halfHeight: number,
    orientation: Quaternion,
    layerMask: number
  ): Uint32Array {
    return this._pxSceneQueries.overlap(
      this._getCapsuleGeometry(radius, halfHeight),
      PhysXPhysicsScene._queryPose(center, orientation, PhysXShape._yAxis),
      layerMask,
      true,
      null
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.gc }
   */
  gc(): void {
    this._triggerEventPool.length = 0;
    this._contactSetPool.length = 0;
    if (this._raycastBuffers) {
      this._raycastBuffers.length = 0;
    }
    const events = this._physicsEvents;
    events.contactEvents.length = 0;
    events.triggerEvents.length = 0;
    this._contactFloatOffset = 0;
    this._contactData = undefined;
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
    // The controller manager releases its controllers through the scene.
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
  _addShape(id: number): void {
    const changes = this._shapeChanges;
    changes.has(id) && changes.set(id, ShapeChange.Reconciled);
  }

  /**
   * @internal
   * Queue removal for the next simulation step. Pairs for a collider that stays removed end silently.
   * If the same collider ID returns before the step, rediscovered pairs continue and the others emit exits.
   */
  _removeShape(id: number): void {
    this._clearContactsForShape(id);
    if (this._activeTriggers.length > 0) {
      this._shapeChanges.set(id, ShapeChange.Removed);
    } else {
      this._shapeChanges.delete(id);
      delete this._eventMap[id];
    }
  }

  /** @internal Reconcile active trigger and contact pairs across a same-actor shape replacement. */
  _replaceShape(id: number): void {
    if (this._activeTriggers.length > 0 || this._activeContacts.has(id)) {
      this._shapeChanges.set(id, ShapeChange.Reconciled);
    }
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

  private _getCapsuleGeometry(radius: number, halfHeight: number): any {
    const geometry = this._capsuleGeometry;
    if (geometry) {
      geometry.radius = radius;
      geometry.halfHeight = halfHeight;
      return geometry;
    }
    return (this._capsuleGeometry = new this._physXPhysics._physX.PxCapsuleGeometry(radius, halfHeight));
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
      layerMask,
      true,
      null,
      false,
      false
    );
    if (hits.length === 0) {
      return false;
    }
    if (outHitResult) {
      this._readHit(hits, 0, outHitResult);
    }
    return true;
  }

  private _syncShapeChanges(): void {
    const changes = this._shapeChanges;
    if (changes.size === 0) {
      return;
    }
    const activeTriggers = this._activeTriggers;
    for (let i = 0; i < activeTriggers.length; ) {
      const event = activeTriggers[i];
      const first = changes.get(event.shape0Id);
      const second = changes.get(event.shape1Id);
      if (first === ShapeChange.Removed || second === ShapeChange.Removed) {
        this._retireTrigger(event, i);
        continue;
      } else if (first !== undefined || second !== undefined) {
        // Start with an exit and let PhysX restore the stay if it reports the pair again.
        event._pendingState = PhysicsEventState.Exit;
      }
      i++;
    }
    changes.forEach(PhysXPhysicsScene._applyShapeChange, this);
    changes.clear();
  }

  private _retireTrigger(event: TriggerEvent, index: number): void {
    const activeTriggers = this._activeTriggers;
    const last = activeTriggers.pop()!;
    if (last !== event) {
      activeTriggers[index] = last;
    }
    this._triggerEventPool.push(event);
    const pairs = this._eventMap[event.shape0Id];
    if (pairs[event.shape1Id] === event) delete pairs[event.shape1Id];
  }

  private _bufferContactEvent(
    shape0ID: number,
    shape1ID: number,
    count: number,
    contacts: Float32Array | null,
    state: PhysicsEventState
  ): void {
    const events = this._physicsEvents;
    const index = events.contactEventCount++;
    const event = (events.contactEvents[index] ||= new ContactEvent(this));
    event.shape0Id = shape0ID;
    event.shape1Id = shape1ID;
    event.state = state;
    event.contactCount = count;
    if (count === 0) {
      return;
    }

    // Copy the raw contact floats into a flat arena and populate Vector3 fields only when read.
    const floatCount = count * 10;
    const offset = this._contactFloatOffset;
    const needed = offset + floatCount;
    let arena = this._contactData;
    if (!arena || needed > arena.length) {
      let nextLength = arena ? arena.length * 2 : 2560;
      while (nextLength < needed) nextLength *= 2;
      const grown = new Float32Array(nextLength);
      if (arena && offset > 0) {
        grown.set(arena.subarray(0, offset));
      }
      this._contactData = arena = grown;
    }
    for (let i = 0; i < floatCount; i++) {
      arena[offset + i] = contacts![i];
    }
    this._contactFloatOffset = needed;
    event._floatOffset = offset;
  }

  private _acquireContactSet(contacts: Map<number, Set<number>>, id: number): Set<number> {
    const neighbors = this._contactSetPool.pop() ?? new Set<number>();
    contacts.set(id, neighbors);
    return neighbors;
  }

  private _deleteContactNeighbor(contacts: Map<number, Set<number>>, id: number, other: number): boolean {
    const neighbors = contacts.get(id);
    if (!neighbors?.delete(other)) return false;
    if (neighbors.size === 0) {
      contacts.delete(id);
      this._contactSetPool.push(neighbors);
    }
    return true;
  }

  private _addActiveContact(a: number, b: number): void {
    const contacts = this._activeContacts;
    const neighbors = contacts.get(a);
    if (neighbors?.has(b)) return;
    (neighbors ?? this._acquireContactSet(contacts, a)).add(b);
    (contacts.get(b) ?? this._acquireContactSet(contacts, b)).add(a);
  }

  private _removeActiveContact(a: number, b: number): void {
    const contacts = this._activeContacts;
    this._deleteContactNeighbor(contacts, a, b);
    this._deleteContactNeighbor(contacts, b, a);
  }

  private _clearContactsForShape(id: number): void {
    const neighbors = this._activeContacts.get(id);
    if (!neighbors) return;
    this._activeContacts.delete(id);
    this._iterShapeId = id;
    neighbors.forEach(PhysXPhysicsScene._removeContactNeighbor, this);
    neighbors.clear();
    this._contactSetPool.push(neighbors);
  }

  private _consumePendingReplacedContact(a: number, b: number): boolean {
    const pending = this._pendingReplacedContacts;
    if (pending.size === 0) return false;
    const small = a < b ? a : b;
    const big = a < b ? b : a;
    return this._deleteContactNeighbor(pending, small, big);
  }

  private _flushReplacedContactExits(): void {
    const pending = this._pendingReplacedContacts;
    if (pending.size === 0) return;
    pending.forEach(PhysXPhysicsScene._flushPendingReplacedSet, this);
    pending.clear();
  }
}

/**
 * Tracks a trigger pair by collider ID.
 */
class TriggerEvent implements ITriggerEvent {
  state: PhysicsEventState;
  /** @internal */
  _pendingState: PhysicsEventState;

  constructor(
    public shape0Id: number,
    public shape1Id: number
  ) {}
}

class ContactEvent implements IContactEvent {
  state: PhysicsEventState;
  shape0Id: number;
  shape1Id: number;
  contactCount = 0;
  /** @internal */
  _floatOffset = 0;
  private readonly _scene: PhysXPhysicsScene;

  constructor(scene: PhysXPhysicsScene) {
    this._scene = scene;
  }

  getContact(index: number, out: IContactPoint): void {
    const data = this._scene._contactData!;
    const offset = this._floatOffset + index * 10;
    out.position.set(data[offset], data[offset + 1], data[offset + 2]);
    out.normal.set(data[offset + 3], data[offset + 4], data[offset + 5]);
    out.impulse.set(data[offset + 6], data[offset + 7], data[offset + 8]);
    out.separation = data[offset + 9];
  }
}

const enum ShapeChange {
  Removed = 0,
  Reconciled = 1
}
