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

/**
 * Simulates actors and runs scene queries through PhysX.
 */
export class PhysXPhysicsScene implements IPhysicsScene {
  private static readonly _emptyExcluded: number[] = [];
  private static readonly _emptyContacts = new Float32Array(0);
  private static readonly _capsuleYAxis = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
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

  /** @internal */
  _pxControllerManager: any = null;
  /** @internal */
  _contactData = new Float32Array(2560);

  private _boxGeometry: any = null;
  private _sphereGeometry: any = null;
  private _capsuleGeometry: any = null;

  private _physXPhysics: PhysXPhysics;
  private _pxScene: any;
  private _pxSceneQueries: any;
  private _physXSimulationCallbackInstance: any;

  private _contactFloatOffset = 0;

  private _activeTriggers: TriggerEvent[] = [];
  private readonly _physicsEvents = {
    contactEvents: [] as ContactEvent[],
    contactEventCount: 0,
    triggerEvents: [] as TriggerEvent[]
  };

  private _triggerEventPool: TriggerEvent[] = [];
  private _raycastBuffers?: Float64Array[];
  // Store each scene-local pair under its two collider IDs in ascending order.
  private _eventMap: Record<number, Record<number, TriggerEvent | undefined>> = Object.create(null);
  private _shapeChanges = new Map<number, ShapeChange>();
  // Active solid contact adjacency by collider ID while contact events are enabled.
  private _activeContacts = new Map<number, Set<number>>();
  // Canonical (small -> Set<big>) pairs from replaced shapes awaiting re-contact or synthetic exit.
  private _pendingReplacedContacts = new Map<number, Set<number>>();

  private readonly _applyShapeChange = (change: ShapeChange, id: number): void => {
    if (change === ShapeChange.Removed) {
      delete this._eventMap[id];
    } else if (change === ShapeChange.Replaced) {
      const neighbors = this._activeContacts.get(id);
      if (!neighbors) return;
      const pending = this._pendingReplacedContacts;
      for (const otherId of neighbors) {
        const small = id < otherId ? id : otherId;
        const big = id < otherId ? otherId : id;
        let set = pending.get(small);
        if (!set) {
          set = new Set<number>();
          pending.set(small, set);
        }
        set.add(big);
      }
    }
  };

  /**
   * Creates a PhysX scene with buffered collision and trigger events.
   * @param physXPhysics - The native physics implementation
   */
  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;

    const physX = physXPhysics._physX;

    const simulationCallback = {
      onJointBreak: () => {},
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
      onTriggerBegin: (index1, index2) => {
        const small = Math.min(index1, index2);
        const big = Math.max(index1, index2);
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
      onTriggerEnd: (index1, index2) => {
        const pairs = this._eventMap[Math.min(index1, index2)];
        const big = Math.max(index1, index2);
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
  setGravity(value: Vector3) {
    this._pxScene.setGravity(value);
  }

  /**
   * {@inheritDoc IPhysicsScene.addActor }
   */
  addActor(actor: PhysXActor): void {
    actor._scene = this;
    this._pxScene.addActor(actor._pxActor, null);
    const shapes = actor._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._addShape(shapes[i]._id);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.removeActor }
   */
  removeActor(actor: PhysXActor): void {
    actor._scene = null;
    this._pxScene.removeActor(actor._pxActor, true);
    const shapes = actor._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeShape(shapes[i]._id);
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
      this._pendingReplacedContacts.clear();
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
    triggerEvents.length = 0;
    for (let i = 0; i < activeTriggers.length; ) {
      const event = activeTriggers[i];
      const state = (event.state = event._pendingState);
      triggerEvents.push(event);
      if (state === PhysicsEventState.Enter) {
        event._pendingState = PhysicsEventState.Stay;
      } else if (state === PhysicsEventState.Exit) {
        this._retireTrigger(event, i);
        continue;
      }
      i++;
    }
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
      PhysXPhysicsScene._emptyExcluded,
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
      PhysXPhysicsScene._emptyExcluded,
      false
    );
    const length = hits.length;
    if (!length) return;

    // Nested queries can overwrite the WASM view. Keep a separate snapshot for each active dispatch.
    const buffers = (this._raycastBuffers ||= []);
    let buffer = buffers.pop();
    if (!buffer || buffer.length < length) {
      let nextLength = buffer ? buffer.length * 2 : 144;
      while (nextLength < length) nextLength *= 2;
      buffer = new Float64Array(nextLength);
    }
    buffer.set(hits);
    try {
      for (let i = 0; i < length; i += 9) {
        this._readHit(buffer, i, onHit);
      }
    } finally {
      buffers.push(buffer);
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
    halfHeight: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    return this._sweepSingle(
      this._getCapsuleGeometry(radius, halfHeight),
      PhysXPhysicsScene._queryPose(center, orientation, PhysXPhysicsScene._capsuleYAxis),
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
      PhysXPhysicsScene._emptyExcluded
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
      PhysXPhysicsScene._emptyExcluded
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
      PhysXPhysicsScene._queryPose(center, orientation, PhysXPhysicsScene._capsuleYAxis),
      layerMask,
      true,
      PhysXPhysicsScene._emptyExcluded
    );
  }

  /**
   * {@inheritDoc IPhysicsScene.gc }
   */
  gc(): void {
    this._triggerEventPool.length = 0;
    if (this._raycastBuffers) {
      this._raycastBuffers.length = 0;
    }
    const events = this._physicsEvents;
    events.contactEvents.length = 0;
    events.triggerEvents.length = 0;
    this._contactFloatOffset = 0;
    if (this._contactData.length > 2560) {
      this._contactData = new Float32Array(2560);
    }
  }

  /**
   * {@inheritDoc IPhysicsScene.destroy }
   */
  destroy(): void {
    this._raycastBuffers = undefined;
    this._activeContacts.clear();
    this._pendingReplacedContacts.clear();
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
    changes.has(id) && changes.set(id, ShapeChange.Refreshed);
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
      this._shapeChanges.set(id, ShapeChange.Replaced);
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
      PhysXPhysicsScene._emptyExcluded,
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
    changes.forEach(this._applyShapeChange);
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
    contacts: Float32Array,
    state: PhysicsEventState
  ): void {
    const events = this._physicsEvents;
    const index = events.contactEventCount++;
    const event = (events.contactEvents[index] ||= new ContactEvent(this));
    event.shape0Id = shape0ID;
    event.shape1Id = shape1ID;
    event.state = state;

    // Copy the raw contact floats into a flat arena and populate Vector3 fields only when read.
    const floatCount = count * 10;
    const offset = this._contactFloatOffset;
    const needed = offset + floatCount;
    let arena = this._contactData;
    if (needed > arena.length) {
      let nextLength = arena.length * 2;
      while (nextLength < needed) nextLength *= 2;
      const grown = new Float32Array(nextLength);
      grown.set(arena.subarray(0, offset));
      this._contactData = arena = grown;
    }
    for (let i = 0; i < floatCount; i++) {
      arena[offset + i] = contacts[i];
    }
    this._contactFloatOffset = needed;

    event._floatOffset = offset;
    event.contactCount = count;
  }

  private _addActiveContact(a: number, b: number): void {
    let setA = this._activeContacts.get(a);
    if (setA?.has(b)) return;
    if (!setA) {
      setA = new Set<number>();
      this._activeContacts.set(a, setA);
    }
    setA.add(b);
    let setB = this._activeContacts.get(b);
    if (!setB) {
      setB = new Set<number>();
      this._activeContacts.set(b, setB);
    }
    setB.add(a);
  }

  private _removeActiveContact(a: number, b: number): void {
    const setA = this._activeContacts.get(a);
    if (setA) {
      setA.delete(b);
      setA.size === 0 && this._activeContacts.delete(a);
    }
    const setB = this._activeContacts.get(b);
    if (setB) {
      setB.delete(a);
      setB.size === 0 && this._activeContacts.delete(b);
    }
  }

  private _clearContactsForShape(id: number): void {
    const neighbors = this._activeContacts.get(id);
    if (!neighbors) return;
    this._activeContacts.delete(id);
    for (const otherId of neighbors) {
      const otherSet = this._activeContacts.get(otherId)!;
      otherSet.delete(id);
      otherSet.size === 0 && this._activeContacts.delete(otherId);
    }
  }

  private _consumePendingReplacedContact(a: number, b: number): boolean {
    const pending = this._pendingReplacedContacts;
    if (pending.size === 0) return false;
    const small = a < b ? a : b;
    const big = a < b ? b : a;
    const set = pending.get(small);
    if (!set?.delete(big)) return false;
    set.size === 0 && pending.delete(small);
    return true;
  }

  private _flushReplacedContactExits(): void {
    const pending = this._pendingReplacedContacts;
    if (pending.size === 0) return;
    const emptyContacts = PhysXPhysicsScene._emptyContacts;
    for (const [small, set] of pending) {
      for (const big of set) {
        this._removeActiveContact(small, big);
        this._bufferContactEvent(small, big, 0, emptyContacts, PhysicsEventState.Exit);
      }
    }
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
    const data = this._scene._contactData;
    const offset = this._floatOffset + index * 10;
    out.position.set(data[offset], data[offset + 1], data[offset + 2]);
    out.normal.set(data[offset + 3], data[offset + 4], data[offset + 5]);
    out.impulse.set(data[offset + 6], data[offset + 7], data[offset + 8]);
    out.separation = data[offset + 9];
  }
}

const enum ShapeChange {
  Removed = 0,
  Refreshed = 1,
  Replaced = 2
}
