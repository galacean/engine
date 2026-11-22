import { Vector3, Quaternion } from "@galacean/engine";
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
  private static readonly _emptyExcluded: number[] = [];
  private static readonly _capsuleYAxis = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
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
  private _raycastBuffers?: Float64Array[];
  private _raycastDepth = 0;

  /** @internal */
  _contactData = new Float32Array(2560);
  private _contactFloatOffset = 0;

  private _activeTriggers: TriggerEvent[] = [];
  private readonly _physicsEvents = {
    contactEvents: [] as ContactEvent[],
    contactEventCount: 0,
    triggerEvents: [] as TriggerEvent[],
    bodySleepEventIds: [] as number[],
    bodySleepEventCount: 0
  };

  private _triggerEventPool: TriggerEvent[] = [];
  // Store each scene-local pair under its two collider IDs in ascending order.
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
      onJointBreak: () => {},
      onBodySleepChanged: (id: number, sleeping: boolean) => {
        const events = this._physicsEvents;
        events.bodySleepEventIds[events.bodySleepEventCount++] = sleeping ? -id : id;
      },
      onContactBegin: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, count, data, PhysicsEventState.Enter);
      },
      onContactEnd: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, count, data, PhysicsEventState.Exit);
      },
      onContactPersist: (shape0ID: number, shape1ID: number, count: number, data: Float32Array) => {
        this._bufferContactEvent(shape0ID, shape1ID, count, data, PhysicsEventState.Stay);
      },
      onTriggerBegin: (index1, index2) => {
        const small = Math.min(index1, index2);
        const big = Math.max(index1, index2);
        const pairs = (this._eventMap[small] ||= Object.create(null));
        const existing = pairs[big];
        if (existing) {
          // Treat a rediscovered pair as a continuous overlap.
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
        this._activeTriggers.push(event);
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
    this._physicsEvents.bodySleepEventCount = 0;
    this._contactFloatOffset = 0;
    this._syncTriggerPairs();
    const scene = this._pxScene;
    scene.simulate(elapsedTime, true);
    scene.fetchResults(true);
  }

  /**
   * {@inheritDoc IPhysicsScene.setContactEventEnabled }
   */
  setContactEventEnabled(enabled: boolean): void {
    this._pxScene.setContactEventEnabled(enabled);
    if (!enabled) {
      this._physicsEvents.contactEventCount = 0;
      this._contactFloatOffset = 0;
    }
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
      const state = (event.dispatchState = event.state);
      triggerEvents.push(event);
      if (state === PhysicsEventState.Enter) {
        event.state = PhysicsEventState.Stay;
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
    const depth = this._raycastDepth++;
    try {
      let buffer = buffers[depth];
      if (!buffer || buffer.length < length) {
        let nextLength = buffer ? buffer.length * 2 : 144;
        while (nextLength < length) nextLength *= 2;
        buffers[depth] = buffer = new Float64Array(nextLength);
      }
      buffer.set(hits);
      for (let i = 0; i < length; i += 9) {
        this._readHit(buffer, i, onHit);
      }
    } finally {
      this._raycastDepth--;
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
    height: number,
    orientation: Quaternion,
    layerMask: number
  ): Uint32Array {
    return this._pxSceneQueries.overlap(
      this._getCapsuleGeometry(radius, height),
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
    const buffers = this._raycastBuffers;
    if (buffers) buffers.length = 0;
    this._triggerEventPool.length = 0;
    const events = this._physicsEvents;
    if (events.contactEventCount === 0) {
      events.contactEvents.length = 0;
      events.triggerEvents.length = 0;
      this._contactFloatOffset = 0;
      if (this._contactData.length > 2560) {
        this._contactData = new Float32Array(2560);
      }
    } else {
      events.contactEvents.length = events.contactEventCount;
    }
    events.bodySleepEventIds.length = events.bodySleepEventCount;
  }

  /**
   * {@inheritDoc IPhysicsScene.destroy }
   */
  destroy(): void {
    this._raycastBuffers = undefined;
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
  _addColliderShape(id: number): void {
    const changes = this._shapeChanges;
    if (changes.has(id)) {
      changes.set(id, true);
    }
  }

  /**
   * @internal
   * Queue removal for the next simulation step. Pairs for a collider that stays removed end silently.
   * If the same collider ID returns before the step, rediscovered pairs continue and the others emit exits.
   */
  _removeColliderShape(id: number): void {
    this._shapeChanges.set(id, false);
  }

  /** @internal Reconcile active trigger pairs when a shape stays in the scene. */
  _refreshTriggerPairsForShape(id: number): void {
    this._shapeChanges.set(id, true);
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
        rotation.normalize();
      } else {
        Quaternion.normalize(orientation, rotation);
      }
    } else if (axis) {
      rotation.copyFrom(axis);
    } else {
      rotation.set(0, 0, 0, 1);
    }
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

  private _syncTriggerPairs(): void {
    const changes = this._shapeChanges;
    if (changes.size === 0) {
      return;
    }
    const activeTriggers = this._activeTriggers;
    for (let i = 0; i < activeTriggers.length; ) {
      const event = activeTriggers[i];
      const first = changes.get(event.index1);
      const second = changes.get(event.index2);
      if (first === false || second === false) {
        this._retireTrigger(event, i);
        continue;
      } else if (first || second) {
        // Start with an exit and let PhysX restore the stay if it reports the pair again.
        event.state = PhysicsEventState.Exit;
      }
      i++;
    }
    changes.forEach(this._forgetRemovedShape);
    changes.clear();
  }

  private readonly _forgetRemovedShape = (present: boolean, id: number): void => {
    if (!present) delete this._eventMap[id];
  };

  private _retireTrigger(event: TriggerEvent, index: number): void {
    const activeTriggers = this._activeTriggers;
    const last = activeTriggers.pop()!;
    if (last !== event) {
      activeTriggers[index] = last;
    }
    this._triggerEventPool.push(event);
    const pairs = this._eventMap[event.index1];
    if (pairs && pairs[event.index2] === event) delete pairs[event.index2];
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

    // Copy the raw contact floats into a flat arena and materialize Vector3 views only when read.
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

    const bufferedContacts = event._bufferedContacts;
    bufferedContacts.floatOffset = offset;
    bufferedContacts.contactCount = count;
  }
}

/**
 * Tracks a trigger pair by collider ID.
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
 * Reusable contact point view materialized lazily on read.
 */
class BufferedContactPoint {
  position = new Vector3();
  normal = new Vector3();
  impulse = new Vector3();
  separation = 0;
}

/**
 * Lazy view into a pair's slice of the scene's flat contact float arena.
 */
class BufferedContacts {
  floatOffset = 0;
  contactCount = 0;
  private readonly _scene: PhysXPhysicsScene;
  private readonly _scratchPoint = new BufferedContactPoint();

  constructor(scene: PhysXPhysicsScene) {
    this._scene = scene;
  }

  size(): number {
    return this.contactCount;
  }

  get(index: number): BufferedContactPoint {
    const data = this._scene._contactData;
    const offset = this.floatOffset + index * 10;
    const point = this._scratchPoint;
    point.position.set(data[offset], data[offset + 1], data[offset + 2]);
    point.normal.set(data[offset + 3], data[offset + 4], data[offset + 5]);
    point.impulse.set(data[offset + 6], data[offset + 7], data[offset + 8]);
    point.separation = data[offset + 9];
    return point;
  }
}

class ContactEvent implements IContactEvent {
  state: PhysicsEventState;
  shape0Id: number;
  shape1Id: number;

  /** @internal */
  _bufferedContacts: BufferedContacts;

  constructor(scene: PhysXPhysicsScene) {
    this._bufferedContacts = new BufferedContacts(scene);
  }

  get contactCount(): number {
    return this._bufferedContacts.contactCount;
  }

  getContacts(): BufferedContacts {
    return this._bufferedContacts;
  }
}
