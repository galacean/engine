import { IDynamicActor, IPhysicsEvents, IPhysicsScene, PhysicsEventState } from "@galacean/engine-design";
import { MathUtil, Ray, Vector3, Quaternion } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Scene } from "../Scene";
import { Script } from "../Script";
import { Utils } from "../Utils";
import { Collider } from "./Collider";
import { Collision } from "./Collision";
import { HitResult } from "./HitResult";
import { PhysicsUtils } from "./PhysicsUtils";
import { Rigidbody } from "./Rigidbody";

/**
 * Simulates colliders, rigidbodies, and constraints in a scene.
 * @remarks Pending Rigidbody poses and Collider changes are synchronized before simulation and scene queries.
 * Casts normalize world-space directions internally and only report hits at positive distances.
 * An invalid direction or a non-positive distance is a miss. Single-hit casts clear a supplied {@link HitResult}
 * on a miss.
 */
export class PhysicsScene {
  private static readonly _identityQuaternion = new Quaternion(0, 0, 0, 1);
  private static readonly _defaultTriggerStay = Script.prototype.onTriggerStay;
  private static readonly _tempDirection = new Vector3();
  private static readonly _raycastHitPool: HitResult[] = [];
  private static readonly _raycastSeenHits = new Set<HitResult>();
  private static readonly _tempPosition = new Vector3();
  private static readonly _tempRotation = new Quaternion();
  private static readonly _dispatchReceivers: (Rigidbody | Collider)[][] = [];
  private static readonly _parsedCastArgs = {
    orientation: PhysicsScene._identityQuaternion,
    distance: Number.MAX_VALUE,
    layerMask: Layer.Everything,
    hitResult: undefined as HitResult | undefined
  };
  private static readonly _scriptIndexSetter = (element: Script, index: number) => {
    element._entityScriptsIndex = index;
  };
  private static _snapshotReceivers(
    events: readonly { shape0Id: number; shape1Id: number }[],
    count: number,
    out: (Rigidbody | Collider)[],
    offset: number
  ): void {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    for (let i = 0; i < count; i++) {
      const event = events[i];
      const collider0 = physicalObjectsMap[event.shape0Id];
      const collider1 = physicalObjectsMap[event.shape1Id];
      const base = offset + i * 4;
      out[base] = collider0;
      out[base + 1] = collider0._attachedBody ?? collider0;
      out[base + 2] = collider1;
      out[base + 3] = collider1._attachedBody ?? collider1;
    }
  }

  private static _dispatchTrigger(
    state: PhysicsEventState,
    current: Rigidbody | Collider,
    previous: Rigidbody | Collider | undefined,
    self: Collider,
    other: Collider
  ): void {
    const oldReceiver = previous && previous !== current && previous.entity !== current.entity ? previous : undefined;
    if (state === PhysicsEventState.Stay && oldReceiver) {
      PhysicsScene._dispatchScripts(PhysicsEventState.Exit, oldReceiver, self, other);
      PhysicsScene._dispatchScripts(PhysicsEventState.Enter, current, self, other);
    } else {
      const receiver = state === PhysicsEventState.Exit ? (oldReceiver ?? current) : current;
      PhysicsScene._dispatchScripts(state, receiver, self, other);
    }
  }

  private static _dispatchScripts(
    state: PhysicsEventState,
    receiver: Rigidbody | Collider,
    self: Collider,
    other: Collider,
    collision?: Collision
  ): void {
    if (receiver.destroyed) return;
    const scripts = receiver.entity._scripts;
    const count = scripts.length;
    const elements = scripts._elements;
    let first = 0;
    if (!collision && state === PhysicsEventState.Stay) {
      const defaultStay = PhysicsScene._defaultTriggerStay;
      while (first < count && elements[first]?.onTriggerStay === defaultStay) first++;
    }
    if (first === count) return;
    scripts._startLoop();
    try {
      if (collision) {
        for (let i = 0; i < count; i++) {
          const script = elements[i];
          if (!script) continue;
          collision.collider = other;
          collision.selfCollider = self;
          if (state === PhysicsEventState.Stay) script.onCollisionStay(collision);
          else if (state === PhysicsEventState.Enter) script.onCollisionEnter(collision);
          else script.onCollisionExit(collision);
        }
      } else {
        for (let i = first; i < count; i++) {
          const script = elements[i];
          if (!script) continue;
          if (state === PhysicsEventState.Stay) script.onTriggerStay(other, self);
          else if (state === PhysicsEventState.Enter) script.onTriggerEnter(other, self);
          else script.onTriggerExit(other, self);
        }
      }
    } finally {
      scripts._endLoop(PhysicsScene._scriptIndexSetter);
    }
  }

  private static _addDirty<T extends { _dirtyIndex: number }>(list: T[], item: T): void {
    if (item._dirtyIndex === -1) {
      item._dirtyIndex = list.length;
      list.push(item);
    }
  }

  private static _removeDirty<T extends { _dirtyIndex: number }>(list: T[], item: T): void {
    const index = item._dirtyIndex;
    if (index !== -1) {
      const last = list.pop()!;
      if (last !== item) {
        list[index] = last;
        last._dirtyIndex = index;
      }
      item._dirtyIndex = -1;
    }
  }

  private static _collectColliders(ids: ArrayLike<number> | undefined, out?: Collider[]): Collider[] {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const count = ids?.length ?? 0;
    const result = out ?? [];
    for (let i = 0; i < count; i++) {
      result[i] = physicalObjectsMap[ids![i]];
    }
    result.length = count;
    return result;
  }

  private static _isValidBoxExtents(halfExtents: Vector3): boolean {
    return (
      PhysicsUtils.isValidPositiveFloat32(halfExtents.x) &&
      PhysicsUtils.isValidPositiveFloat32(halfExtents.y) &&
      PhysicsUtils.isValidPositiveFloat32(halfExtents.z)
    );
  }

  private static _capsuleHalfHeight(radius: number, height: number): number {
    const halfHeight = (height - 2 * radius) * 0.5;
    return PhysicsUtils.isValidPositiveFloat32(radius) && height >= 0 && Number.isFinite(Math.fround(halfHeight))
      ? halfHeight
      : NaN;
  }

  private static _parseCastArgs(
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ) {
    if (typeof layerMaskOrResult !== "number") {
      outHitResult ??= layerMaskOrResult;
      layerMaskOrResult = Layer.Everything;
    }
    if (typeof distanceOrResult !== "number") {
      outHitResult ??= distanceOrResult;
      distanceOrResult = Number.MAX_VALUE;
    }
    const args = PhysicsScene._parsedCastArgs;
    args.distance = distanceOrResult;
    args.layerMask = layerMaskOrResult;
    args.hitResult = outHitResult;
    return args;
  }

  private static _parseOrientedCastArgs(
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMask?: Layer,
    outHitResult?: HitResult
  ) {
    let orientation = PhysicsScene._identityQuaternion;
    if (layerMask !== undefined || orientationOrDistanceOrResult instanceof Quaternion) {
      orientation = (orientationOrDistanceOrResult as Quaternion) ?? orientation;
      orientationOrDistanceOrResult = distanceOrResult;
      distanceOrResult = layerMask;
    }
    const args = PhysicsScene._parseCastArgs(orientationOrDistanceOrResult, distanceOrResult, outHitResult);
    args.orientation = orientation;
    return args;
  }

  private static _writeHitResult(
    hits: Readonly<Float64Array>,
    offset: number,
    outHitResult: HitResult,
    collider = Engine._physicalObjectsMap[hits[offset]]
  ): void {
    const distance = hits[offset + 1];
    // A caller's output vector can trigger another query when written.
    const px = hits[offset + 2];
    const py = hits[offset + 3];
    const pz = hits[offset + 4];
    const nx = hits[offset + 5];
    const ny = hits[offset + 6];
    const nz = hits[offset + 7];
    outHitResult.entity = collider.entity;
    outHitResult.collider = collider;
    outHitResult.distance = distance;
    outHitResult.point.set(px, py, pz);
    outHitResult.normal.set(nx, ny, nz);
  }

  private static _finishCast(hits: Readonly<Float64Array> | undefined, outHitResult?: HitResult): boolean {
    if (hits?.length) {
      if (outHitResult) PhysicsScene._writeHitResult(hits, 0, outHitResult);
      return true;
    }
    if (outHitResult) PhysicsScene._clearHitResult(outHitResult);
    return false;
  }

  private static _clearHitResult(hitResult: HitResult): void {
    hitResult.entity = null;
    hitResult.collider = null;
    hitResult.distance = 0;
    hitResult.point.set(0, 0, 0);
    hitResult.normal.set(0, 0, 0);
  }

  /** @internal */
  _nativePhysicsScene: IPhysicsScene;

  private _scene: Scene;
  private _restTime: number = 0;
  private _fixedTimeStep: number = 1 / 60;

  private _bodies: Rigidbody[] = [];
  private _bodyOrderDirty = false;
  private _dirtyBodies: Rigidbody[] = [];
  private _dirtyColliders: Collider[] = [];
  private _massDirtyBodies: Rigidbody[] = [];
  private _pendingSleeps?: Rigidbody[];
  private _collision: Collision;

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);
  private _contactEventConsumerCount = 0;
  private _raycastSnapshots?: { values: Float64Array; colliders: Collider[] }[];

  /**
   * The gravity of physics scene.
   */
  get gravity(): Vector3 {
    return this._gravity;
  }

  set gravity(value: Vector3) {
    const gravity = this._gravity;
    if (gravity !== value) {
      gravity.copyFrom(value);
    }
  }

  /**
   * The fixed time step in seconds at which physics are performed.
   */
  get fixedTimeStep(): number {
    return this._fixedTimeStep;
  }

  set fixedTimeStep(value: number) {
    this._fixedTimeStep = Math.max(value, MathUtil.zeroTolerance);
  }

  constructor(scene: Scene) {
    this._scene = scene;

    if (scene.engine._physicsInitialized) {
      this._setGravity = this._setGravity.bind(this);
      this._gravity._onValueChanged = this._setGravity;
      this._nativePhysicsScene = Engine._nativePhysics.createPhysicsScene();
      this._nativePhysicsScene.setContactEventEnabled(false);
    }
  }

  /**
   * Get whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @returns Whether the colliders should collide
   * @throws When either layer is not a single layer (`Layer.Layer0` to `Layer.Layer31`).
   */
  getColliderLayerCollision(layer1: Layer, layer2: Layer): boolean {
    return this._nativePhysicsScene.getColliderLayerCollision(
      PhysicsUtils.getLayerIndex(layer1),
      PhysicsUtils.getLayerIndex(layer2)
    );
  }

  /**
   * Set whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @param isCollide - Whether the colliders should collide
   * @throws When either layer is not a single layer (`Layer.Layer0` to `Layer.Layer31`).
   */
  setColliderLayerCollision(layer1: Layer, layer2: Layer, isCollide: boolean): void {
    this._nativePhysicsScene.setColliderLayerCollision(
      PhysicsUtils.getLayerIndex(layer1),
      PhysicsUtils.getLayerIndex(layer2),
      isCollide
    );
  }

  /**
   * Get the layers that can collide with the specified layer in this physics scene.
   * @param layer - A single collision layer
   * @returns The enabled layer mask, including the layer itself when self-collision is enabled
   */
  getColliderLayerCollisionMask(layer: Layer): Layer {
    const index = Collider._getLayerIndex(layer);
    const nativeScene = this._nativePhysicsScene;
    let mask = 0;
    for (let other = 0; other < 32; other++) {
      if (nativeScene.getColliderLayerCollision(index, other)) mask |= 1 << other;
    }
    return mask >>> 0;
  }

  /**
   * Replace the layers that can collide with the specified layer in this physics scene.
   * @remarks Collision rules are symmetric, so this also updates the corresponding bits in other layers' masks.
   * @param layer - A single collision layer
   * @param mask - The layers to enable, including the layer itself to permit self-collision
   */
  setColliderLayerCollisionMask(layer: Layer, mask: Layer): void {
    const index = Collider._getLayerIndex(layer);
    if (mask >>> 0 !== mask && (mask | 0) !== mask) {
      throw new Error("Collision mask must be a 32-bit layer mask.");
    }
    const nativeScene = this._nativePhysicsScene;
    for (let other = 0; other < 32; other++) {
      nativeScene.setColliderLayerCollision(index, other, (mask & (1 << other)) !== 0);
    }
  }

  /**
   * Tests whether a world-space ray hits a collider.
   */
  raycast(ray: Ray): boolean;

  /**
   * Tests whether a world-space ray hits a collider.
   * @param outHitResult - Receives the closest hit.
   */
  raycast(ray: Ray, outHitResult: HitResult): boolean;

  /**
   * Tests whether a world-space ray hits a collider.
   * @param distance - Maximum distance in world units.
   */
  raycast(ray: Ray, distance: number): boolean;

  /**
   * Tests whether a world-space ray hits a collider.
   * @param distance - Maximum distance in world units.
   * @param outHitResult - Receives the closest hit.
   */
  raycast(ray: Ray, distance: number, outHitResult: HitResult): boolean;

  /**
   * Tests whether a world-space ray hits a collider.
   * @param distance - Maximum distance in world units.
   * @param layerMask - Collision layers to include.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): boolean;

  /**
   * Tests whether a world-space ray hits a collider.
   * @param distance - Maximum distance in world units.
   * @param layerMask - Collision layers to include.
   * @param outHitResult - Receives the closest hit.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): boolean;

  raycast(
    ray: Ray,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    const parsed = PhysicsScene._parseCastArgs(distanceOrResult, layerMaskOrResult, outHitResult);
    const { distance, layerMask, hitResult } = parsed;
    parsed.hitResult = undefined;

    const normalizedDirection = distance > 0 ? this._syncCastDirection(ray.direction) : null;
    const hits = normalizedDirection
      ? this._nativePhysicsScene.raycast(ray.origin, normalizedDirection, distance, layerMask)
      : undefined;
    return PhysicsScene._finishCast(hits, hitResult);
  }

  /**
   * Writes ray hits in unspecified order and returns whether any hit was found.
   * @param outHitResults - Reusable array, resized to the hit count. Discard references to recycled entries.
   */
  raycastAll(ray: Ray, outHitResults: HitResult[]): boolean;

  /**
   * Writes ray hits in unspecified order and returns whether any hit was found.
   * @param distance - Maximum distance in world units.
   * @param outHitResults - Reusable array, resized to the hit count. Discard references to recycled entries.
   */
  raycastAll(ray: Ray, distance: number, outHitResults: HitResult[]): boolean;

  /**
   * Tests a world-space ray and optionally writes all hits in unspecified order.
   * @param ray - World-space ray. The direction is normalized internally.
   * @param distance - Maximum distance in world units. Defaults to `Number.MAX_VALUE`.
   * @param layerMask - Collision layers to include. Defaults to `Layer.Everything`.
   * @param outHitResults - Reusable output array, resized to the hit count. Omit to test for a hit only.
   * @returns Whether any hit was found.
   * @remarks Reuse the array as-is. This call overwrites existing entries and may recycle entries it trims,
   * including caller-supplied objects. Copy hit values to retain them and discard references to recycled entries.
   * Keep result objects in a single output array. Duplicate entries show the last hit written to the shared object.
   * Only positive-distance hits are reported. Invalid directions and non-positive distances empty the output.
   */
  raycastAll(ray: Ray, distance?: number, layerMask?: Layer, outHitResults?: HitResult[]): boolean;

  raycastAll(
    ray: Ray,
    distance: number | HitResult[] = Number.MAX_VALUE,
    layerMask: Layer | HitResult[] = Layer.Everything,
    outHitResults?: HitResult[]
  ): boolean {
    if (typeof layerMask !== "number") {
      outHitResults ||= layerMask;
      layerMask = Layer.Everything;
    }
    if (typeof distance !== "number") {
      outHitResults ||= distance;
      distance = Number.MAX_VALUE;
    }
    if (!outHitResults) {
      return this.raycast(ray, distance, layerMask);
    }

    const pool = PhysicsScene._raycastHitPool;
    let hitCount = 0;
    const normalizedDirection = distance > 0 ? this._syncCastDirection(ray.direction) : null;
    if (normalizedDirection) {
      const hits = this._nativePhysicsScene.raycastAll(ray.origin, normalizedDirection, distance, layerMask);
      const count = hits.length;
      if (count > 9) {
        // Writing an output vector can run another query or destroy a collider.
        const snapshots = (this._raycastSnapshots ??= []);
        const snapshot = snapshots.pop() ?? { values: new Float64Array(count), colliders: [] };
        if (snapshot.values.length < count) {
          snapshot.values = new Float64Array(Math.max(count, snapshot.values.length * 2));
        }
        const { values, colliders } = snapshot;
        values.set(hits);
        const objects = Engine._physicalObjectsMap;
        for (let i = 0, j = 0; i < count; i += 9, j++) colliders[j] = objects[values[i]];
        for (let i = 0; i < count; i += 9) {
          const hit = (outHitResults[hitCount] ||= pool.pop() ?? new HitResult());
          PhysicsScene._writeHitResult(values, i, hit, colliders[hitCount++]);
        }
        colliders.length = 0;
        snapshots.push(snapshot);
      } else if (count) {
        const hit = (outHitResults[hitCount++] ||= pool.pop() ?? new HitResult());
        PhysicsScene._writeHitResult(hits, 0, hit);
      }
    }
    const length = outHitResults.length;
    if (hitCount < length) {
      // Caller entries can alias retained hits or each other. Recycle only unreferenced objects once.
      const seenHits = PhysicsScene._raycastSeenHits;
      let recycleEnd = hitCount;
      for (let i = 0; i < hitCount; i++) {
        seenHits.add(outHitResults[i]);
      }
      for (let i = hitCount; i < length; i++) {
        const hitResult = outHitResults[i];
        if (hitResult && !seenHits.has(hitResult)) {
          seenHits.add(hitResult);
          outHitResults[recycleEnd++] = hitResult;
        }
      }
      seenHits.clear();
      for (let i = hitCount; i < recycleEnd; i++) {
        const hitResult = outHitResults[i];
        PhysicsScene._clearHitResult(hitResult);
        pool.push(hitResult);
      }
    }
    outHitResults.length = hitCount;
    return hitCount > 0;
  }

  /**
   * Tests whether sweeping a box hits a collider.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3): boolean;

  /**
   * Tests whether sweeping a box hits a collider.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   * @param outHitResult - Receives the closest hit.
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Tests whether sweeping a box hits a collider.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   * @param distance - Maximum distance in world units.
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, distance: number): boolean;

  /**
   * Tests whether sweeping a box hits a collider.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   * @param distance - Maximum distance in world units.
   * @param outHitResult - Receives the closest hit.
   */
  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    outHitResult: HitResult
  ): boolean;

  /**
   * Tests whether sweeping a box hits a collider.
   * @param center - Initial center in world space.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   * @param direction - Sweep direction in world space.
   * @param orientation - Rotation of the box in world space.
   * @param distance - Maximum distance in world units.
   * @param layerMask - Collision layers to include.
   * @param outHitResult - Receives the closest hit.
   */
  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    orientation: Quaternion,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const parsed = PhysicsScene._parseOrientedCastArgs(
      orientationOrDistanceOrResult,
      distanceOrResult,
      layerMask,
      outHitResult
    );
    const { orientation, distance, layerMask: mask, hitResult } = parsed;
    parsed.hitResult = undefined;
    parsed.orientation = PhysicsScene._identityQuaternion;

    const normalizedDirection =
      distance > 0 && PhysicsScene._isValidBoxExtents(halfExtents) ? this._syncCastDirection(direction) : null;
    const hits = normalizedDirection
      ? this._nativePhysicsScene.boxCast(center, orientation, halfExtents, normalizedDirection, distance, mask)
      : undefined;
    return PhysicsScene._finishCast(hits, hitResult);
  }

  /**
   * Tests whether sweeping a sphere hits a collider.
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3): boolean;

  /**
   * Tests whether sweeping a sphere hits a collider.
   * @param outHitResult - Receives the closest hit.
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Tests whether sweeping a sphere hits a collider.
   * @param distance - Maximum distance in world units.
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number): boolean;

  /**
   * Tests whether sweeping a sphere hits a collider.
   * @param distance - Maximum distance in world units.
   * @param outHitResult - Receives the closest hit.
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number, outHitResult: HitResult): boolean;

  /**
   * Tests whether sweeping a sphere hits a collider.
   * @param center - Initial center in world space.
   * @param radius - Radius in world units.
   * @param direction - Sweep direction in world space.
   * @param distance - Maximum distance in world units.
   * @param layerMask - Collision layers to include.
   * @param outHitResult - Receives the closest hit.
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    const parsed = PhysicsScene._parseCastArgs(distanceOrResult, layerMaskOrResult, outHitResult);
    const { distance, layerMask, hitResult } = parsed;
    parsed.hitResult = undefined;

    const normalizedDirection =
      distance > 0 && PhysicsUtils.isValidPositiveFloat32(radius) ? this._syncCastDirection(direction) : null;
    const hits = normalizedDirection
      ? this._nativePhysicsScene.sphereCast(center, radius, normalizedDirection, distance, layerMask)
      : undefined;
    return PhysicsScene._finishCast(hits, hitResult);
  }

  /**
   * Tests whether sweeping a capsule hits a collider.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3): boolean;

  /**
   * Tests whether sweeping a capsule hits a collider.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   * @param outHitResult - Receives the closest hit.
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Tests whether sweeping a capsule hits a collider.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   * @param distance - Maximum distance in world units.
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, distance: number): boolean;

  /**
   * Tests whether sweeping a capsule hits a collider.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   * @param distance - Maximum distance in world units.
   * @param outHitResult - Receives the closest hit.
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    distance: number,
    outHitResult: HitResult
  ): boolean;

  /**
   * Tests whether sweeping a capsule hits a collider.
   * @param center - Initial center in world space.
   * @param radius - Radius in world units.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   * @param direction - Sweep direction in world space.
   * @param orientation - World-space rotation of the capsule, whose local long axis is Y.
   * @param distance - Maximum distance in world units.
   * @param layerMask - Collision layers to include.
   * @param outHitResult - Receives the closest hit.
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    orientation: Quaternion,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const parsed = PhysicsScene._parseOrientedCastArgs(
      orientationOrDistanceOrResult,
      distanceOrResult,
      layerMask,
      outHitResult
    );
    const { orientation, distance, layerMask: mask, hitResult } = parsed;
    parsed.hitResult = undefined;
    parsed.orientation = PhysicsScene._identityQuaternion;

    const halfCylinderHeight = PhysicsScene._capsuleHalfHeight(radius, height);
    const normalizedDirection =
      distance > 0 && !Number.isNaN(halfCylinderHeight) ? this._syncCastDirection(direction) : null;
    if (!normalizedDirection) return PhysicsScene._finishCast(undefined, hitResult);

    const hits = PhysicsUtils.isValidPositiveFloat32(halfCylinderHeight)
      ? this._nativePhysicsScene.capsuleCast(
          center,
          radius,
          halfCylinderHeight,
          orientation,
          normalizedDirection,
          distance,
          mask
        )
      : this._nativePhysicsScene.sphereCast(center, radius, normalizedDirection, distance, mask);
    return PhysicsScene._finishCast(hits, hitResult);
  }

  /**
   * Finds the colliders overlapping a box.
   * @param center - Center in world space.
   * @param halfExtents - Half the box size along each of its axes, in world units.
   * @param orientation - Rotation of the box in world space. Defaults to the identity rotation.
   * @param layerMask - Collision layers to include. Defaults to `Layer.Everything`.
   * @param colliders - Output array whose contents are replaced. Omit to allocate an array.
   * @returns The output array, emptied when the dimensions are invalid or there are no overlaps.
   */
  overlapBoxAll(
    center: Vector3,
    halfExtents: Vector3,
    orientation: Quaternion = PhysicsScene._identityQuaternion,
    layerMask: Layer = Layer.Everything,
    colliders?: Collider[]
  ): Collider[] {
    let ids: ArrayLike<number> | undefined;
    if (PhysicsScene._isValidBoxExtents(halfExtents)) {
      this._syncColliders(false);
      ids = this._nativePhysicsScene.overlapBoxAll(center, orientation, halfExtents, layerMask);
    }
    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Finds the colliders overlapping a sphere.
   * @param center - Center in world space.
   * @param radius - Radius in world units.
   * @param layerMask - Collision layers to include. Defaults to `Layer.Everything`.
   * @param colliders - Output array whose contents are replaced. Omit to allocate an array.
   * @returns The output array, emptied when the dimensions are invalid or there are no overlaps.
   */
  overlapSphereAll(
    center: Vector3,
    radius: number,
    layerMask: Layer = Layer.Everything,
    colliders?: Collider[]
  ): Collider[] {
    let ids: ArrayLike<number> | undefined;
    if (PhysicsUtils.isValidPositiveFloat32(radius)) {
      this._syncColliders(false);
      ids = this._nativePhysicsScene.overlapSphereAll(center, radius, layerMask);
    }
    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Finds the colliders overlapping a capsule.
   * @param center - Center in world space.
   * @param radius - Radius in world units.
   * @param height - Total height in world units, including both caps. Values at or below twice the radius degenerate to a sphere.
   * @param orientation - World-space rotation of the capsule, whose local long axis is Y. Defaults to the identity rotation.
   * @param layerMask - Collision layers to include. Defaults to `Layer.Everything`.
   * @param colliders - Output array whose contents are replaced. Omit to allocate an array.
   * @returns The output array, emptied when the dimensions are invalid or there are no overlaps.
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion = PhysicsScene._identityQuaternion,
    layerMask: Layer = Layer.Everything,
    colliders?: Collider[]
  ): Collider[] {
    const halfCylinderHeight = PhysicsScene._capsuleHalfHeight(radius, height);
    let ids: ArrayLike<number> | undefined;
    if (!Number.isNaN(halfCylinderHeight)) {
      this._syncColliders(false);
      ids = PhysicsUtils.isValidPositiveFloat32(halfCylinderHeight)
        ? this._nativePhysicsScene.overlapCapsuleAll(center, radius, halfCylinderHeight, orientation, layerMask)
        : this._nativePhysicsScene.overlapSphereAll(center, radius, layerMask);
    }
    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Call on every frame to update pose of objects.
   * @internal
   */
  _update(deltaTime: number): void {
    const fixedTimeStep = this._fixedTimeStep;
    const simulateTime = this._restTime + deltaTime;
    const step = Math.floor(simulateTime / fixedTimeStep);
    this._restTime = simulateTime - step * fixedTimeStep;
    if (step === 0) return;

    const scene = this._scene;
    const componentsManager = scene._componentsManager;
    const nativePhysicsScene = this._nativePhysicsScene;
    const bodies = this._bodies;
    for (let i = 0; i < step; i++) {
      if (!scene.isActive) return;
      componentsManager.callScriptOnPhysicsUpdate();
      if (!scene.isActive) return;
      this._syncColliders();
      const pendingSleeps = this._pendingSleeps;
      if (pendingSleeps?.length) {
        for (let j = 0, n = pendingSleeps.length; j < n; j++) {
          pendingSleeps[j]._applyScheduledSleep();
        }
        pendingSleeps.length = 0;
      }
      nativePhysicsScene.update(fixedTimeStep);
      this._bodyOrderDirty && this._sortBodies();
      const count = bodies.length;
      let first = 0;
      while (first < count && bodies[first]._hasSettledKinematicPose()) first++;
      if (first < count) {
        const position = PhysicsScene._tempPosition;
        const rotation = PhysicsScene._tempRotation;
        const poses = nativePhysicsScene._readBodyPoses(first);
        const offset = poses.offset;
        for (let j = first; j < count; j++) {
          bodies[j]._writeBack(position, rotation, poses.values, offset + j * 8);
        }
      }
      this._dispatchEvents(nativePhysicsScene.updateEvents());
    }
  }

  /**
   * @internal
   * Apply pending component changes to the native scene: Rigidbody poses first, then Collider ownership and poses
   * relative to them, and optionally the mass properties that depend on the attached Colliders.
   */
  _syncColliders(syncMass = true): void {
    const dirtyBodies = this._dirtyBodies;
    while (dirtyBodies.length) {
      const body = dirtyBodies.pop()!;
      body._dirtyIndex = -1;
      body._syncPose();
    }
    const dirtyColliders = this._dirtyColliders;
    while (dirtyColliders.length) {
      const collider = dirtyColliders.pop()!;
      collider._dirtyIndex = -1;
      collider._sync();
    }
    if (syncMass) {
      const massDirtyBodies = this._massDirtyBodies;
      while (massDirtyBodies.length) {
        const body = massDirtyBodies.pop()!;
        body._massDirtyIndex = -1;
        body._updateMass();
      }
    }
  }

  /**
   * @internal
   */
  _removeCollider(collider: Collider): void {
    PhysicsScene._removeDirty(this._dirtyColliders, collider);
    collider._detach(this);
  }

  /**
   * @internal
   */
  _markColliderDirty(collider: Collider): void {
    PhysicsScene._addDirty(this._dirtyColliders, collider);
  }

  /**
   * @internal
   */
  _addRigidbody(body: Rigidbody, actor: IDynamicActor): void {
    this._nativePhysicsScene.addActor(actor);
    const bodies = this._bodies;
    body._index = bodies.length;
    this._nativePhysicsScene._setBodyPoseActor(body._index, actor);
    bodies.push(body);
    if (body.entity._children.length > 0) {
      this._bodyOrderDirty = true;
    }
    PhysicsScene._addDirty(this._dirtyBodies, body);
  }

  /**
   * @internal
   */
  _removeRigidbody(body: Rigidbody): void {
    PhysicsScene._removeDirty(this._dirtyBodies, body);
    const massIndex = body._massDirtyIndex;
    if (massIndex !== -1) {
      const massDirtyBodies = this._massDirtyBodies;
      const last = massDirtyBodies.pop()!;
      if (last !== body) {
        massDirtyBodies[massIndex] = last;
        last._massDirtyIndex = massIndex;
      }
      body._massDirtyIndex = -1;
    }
    const bodies = this._bodies;
    const last = bodies.pop()!;
    if (last !== body) {
      bodies[body._index] = last;
      last._index = body._index;
      this._nativePhysicsScene._setBodyPoseActor(last._index, last._getNativeActor());
      this._checkBodyOrder(last);
    }
    this._nativePhysicsScene._setBodyPoseActor(bodies.length, null);
    body._index = -1;
    this._nativePhysicsScene.removeActor(body._getNativeActor());
  }

  /**
   * @internal
   */
  _markBodyDirty(body: Rigidbody): void {
    PhysicsScene._addDirty(this._dirtyBodies, body);
  }

  /**
   * @internal
   * Reorder the writeback list when a dirty body now sits below a later-indexed ancestor body.
   */
  _checkBodyOrder(body: Rigidbody): void {
    const bodyIndex = body._index;
    if (this._bodyOrderDirty || bodyIndex === this._bodies.length - 1) return;
    for (let parent = body.entity.parent; parent; parent = parent.parent) {
      const ancestor = parent.getComponent(Rigidbody);
      if (ancestor && ancestor._index !== -1) {
        this._bodyOrderDirty = ancestor._index > bodyIndex;
        return;
      }
    }
  }

  /**
   * @internal
   */
  _queueMassUpdate(body: Rigidbody): void {
    const massDirtyBodies = this._massDirtyBodies;
    body._massDirtyIndex = massDirtyBodies.length;
    massDirtyBodies.push(body);
  }

  /** @internal Schedules or cancels sleep after registration and Collider synchronization. */
  _scheduleSleep(body: Rigidbody, scheduled: boolean): void {
    if (scheduled) {
      (this._pendingSleeps ||= []).push(body);
    } else if (this._pendingSleeps) {
      Utils.removeFromArray(this._pendingSleeps, body);
    }
  }

  /** @internal */
  _addContactEventConsumer(delta: 1 | -1): void {
    const wasEnabled = this._contactEventConsumerCount > 0;
    this._contactEventConsumerCount += delta;
    const enabled = this._contactEventConsumerCount > 0;
    wasEnabled !== enabled && this._nativePhysicsScene?.setContactEventEnabled(enabled);
  }

  /**
   * @internal
   */
  _gc(): void {
    PhysicsScene._raycastHitPool.length = PhysicsScene._dispatchReceivers.length = 0;
    this._raycastSnapshots = undefined;
    this._nativePhysicsScene?.gc(Engine._physicalObjectsMap);
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._gravity._onValueChanged = null;
    PhysicsScene._raycastHitPool.length = PhysicsScene._dispatchReceivers.length = 0;
    this._pendingSleeps = undefined;
    this._raycastSnapshots = undefined;
    this._nativePhysicsScene?.destroy();
    this._nativePhysicsScene = null!;
  }

  private _sortBodies(): void {
    this._bodyOrderDirty = false;
    const bodies = this._bodies;
    const length = bodies.length;
    // Publish ancestors first so each body's world pose is converted against its parent's simulated pose.
    for (let i = 0, n = length - 1; i < n; i++) {
      let body = bodies[i];
      for (let parent = body.entity.parent; parent; parent = parent.parent) {
        const ancestor = parent.getComponent(Rigidbody);
        if (ancestor) {
          const index = ancestor._index;
          if (index === -1) continue;
          if (index < i) break;
          bodies[i] = ancestor;
          bodies[index] = body;
          body._index = index;
          ancestor._index = i;
          this._nativePhysicsScene._setBodyPoseActor(index, body._getNativeActor());
          this._nativePhysicsScene._setBodyPoseActor(i, ancestor._getNativeActor());
          body = ancestor;
        }
      }
    }
  }

  private _dispatchEvents(events: IPhysicsEvents): void {
    const { contactEvents, contactEventCount, triggerEvents } = events;
    const triggerCount = triggerEvents.length;
    const triggerOffset = contactEventCount * 4;
    if (!contactEventCount && !triggerCount) return;

    // Callbacks can change the colliders and receivers of later events.
    const receivers = PhysicsScene._dispatchReceivers.pop() ?? [];
    PhysicsScene._snapshotReceivers(contactEvents, contactEventCount, receivers, 0);
    PhysicsScene._snapshotReceivers(triggerEvents, triggerCount, receivers, triggerOffset);

    if (contactEventCount > 0) {
      const collision = (this._collision ||= new Collision());
      try {
        for (let i = 0; i < contactEventCount; i++) {
          const event = contactEvents[i];
          const base = i * 4;
          const collider0 = <Collider>receivers[base];
          const receiver0 = receivers[base + 1];
          const collider1 = <Collider>receivers[base + 2];
          const receiver1 = receivers[base + 3];
          collision._nativeCollision = event;
          const state = event.state;
          PhysicsScene._dispatchScripts(state, receiver0, collider0, collider1, collision);
          PhysicsScene._dispatchScripts(state, receiver1, collider1, collider0, collision);
        }
      } finally {
        collision._nativeCollision = null!;
        collision.collider = null!;
        collision.selfCollider = null!;
      }
    }

    for (let i = 0; i < triggerCount; i++) {
      const event = triggerEvents[i];
      const base = triggerOffset + i * 4;
      const collider0 = <Collider>receivers[base];
      const current0 = receivers[base + 1];
      const collider1 = <Collider>receivers[base + 2];
      const current1 = receivers[base + 3];
      const state = event.state;
      const previous0 = event._receiver0 as Rigidbody | Collider | undefined;
      const previous1 = event._receiver1 as Rigidbody | Collider | undefined;
      event._receiver0 = state === PhysicsEventState.Exit ? undefined : current0;
      event._receiver1 = state === PhysicsEventState.Exit ? undefined : current1;
      PhysicsScene._dispatchTrigger(state, current0, previous0, collider0, collider1);
      PhysicsScene._dispatchTrigger(state, current1, previous1, collider1, collider0);
    }

    const totalSlots = triggerOffset + triggerCount * 4;
    for (let i = 0; i < totalSlots; i++) {
      receivers[i] = null!;
    }
    PhysicsScene._dispatchReceivers.push(receivers);
  }

  private _syncCastDirection(direction: Vector3): Vector3 | null {
    const out = PhysicsScene._tempDirection;
    if (!Vector3.normalize(direction, out)) return null;
    this._syncColliders(false);
    return out;
  }

  private _setGravity(): void {
    this._nativePhysicsScene.setGravity(this._gravity);
  }
}
