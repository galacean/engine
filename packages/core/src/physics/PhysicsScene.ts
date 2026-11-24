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
import { Rigidbody } from "./Rigidbody";
import { isValidPositiveFloat32 } from "./float32";

/**
 * Simulates colliders, rigidbodies, and constraints in a scene.
 * @remarks Pending Rigidbody poses and Collider changes are synchronized before simulation and scene queries.
 * Casts normalize world-space directions internally and only report hits at positive distances.
 * An invalid direction or a non-positive distance is a miss. Single-hit casts clear a supplied {@link HitResult}
 * on a miss.
 */
export class PhysicsScene {
  private static readonly _identityQuaternion = new Quaternion(0, 0, 0, 1);
  private static readonly _tempDirection = new Vector3();
  private static readonly _tempPosition = new Vector3();
  private static readonly _tempRotation = new Quaternion();
  private static readonly _snapshotBuffers: (Rigidbody | Collider)[][] = [];
  private static readonly _parsedCastArgs = {
    orientation: PhysicsScene._identityQuaternion,
    distance: Number.MAX_VALUE,
    layerMask: Layer.Everything,
    hitResult: undefined as HitResult | undefined
  };
  private static readonly _scriptIndexSetter = (element: Script, index: number) => {
    element._entityScriptsIndex = index;
  };

  private static _pruneTriggerReceiver(this: PhysicsScene, entry: TriggerReceivers, key: number): void {
    entry.stamp !== this._triggerStepStamp && this._triggerReceivers.delete(key);
  }

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

  private static _triggerPairKey(small: number, big: number): number {
    const sum = small + big;
    return sum * (sum + 1) * 0.5 + big;
  }

  private static _dispatchTriggerOwnerChange(
    previous: Rigidbody | Collider,
    current: Rigidbody | Collider,
    self: Collider,
    other: Collider
  ): void {
    if (previous.entity !== current.entity) {
      PhysicsScene._dispatchScripts(PhysicsEventState.Exit, previous, self, other);
      PhysicsScene._dispatchScripts(PhysicsEventState.Enter, current, self, other);
      return;
    }
    PhysicsScene._dispatchScripts(PhysicsEventState.Stay, current, self, other);
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
    if (count === 0) return;
    scripts._startLoop();
    const elements = scripts._elements;
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
      for (let i = 0; i < count; i++) {
        const script = elements[i];
        if (!script) continue;
        if (state === PhysicsEventState.Stay) script.onTriggerStay(other, self);
        else if (state === PhysicsEventState.Enter) script.onTriggerEnter(other, self);
        else script.onTriggerExit(other, self);
      }
    }
    scripts._endLoop(PhysicsScene._scriptIndexSetter);
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
    // Writing to caller storage may run another query and overwrite the borrowed IDs.
    const snapshot = out && count > 1 ? (PhysicsScene._snapshotBuffers.pop() ?? []) : result;
    for (let i = 0; i < count; i++) {
      snapshot[i] = physicalObjectsMap[ids![i]];
    }
    if (snapshot !== result) {
      for (let i = 0; i < count; i++) {
        result[i] = snapshot[i] as Collider;
        snapshot[i] = null!;
      }
      PhysicsScene._snapshotBuffers.push(snapshot);
    }
    result.length = count;
    return result;
  }

  private static _isValidBoxExtents(halfExtents: Vector3): boolean {
    return (
      isValidPositiveFloat32(halfExtents.x) &&
      isValidPositiveFloat32(halfExtents.y) &&
      isValidPositiveFloat32(halfExtents.z)
    );
  }

  private static _parseCastArgs(
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ) {
    const args = PhysicsScene._parsedCastArgs;
    let hitResult: HitResult | undefined;
    let distance = Number.MAX_VALUE;
    let layerMask = Layer.Everything;

    if (typeof distanceOrResult === "number") {
      distance = distanceOrResult;
    } else if (distanceOrResult != null) {
      hitResult = distanceOrResult;
    }

    if (typeof layerMaskOrResult === "number") {
      layerMask = layerMaskOrResult;
    } else if (layerMaskOrResult != null) {
      hitResult = layerMaskOrResult;
    }

    args.distance = distance;
    args.layerMask = layerMask;
    args.hitResult = outHitResult ?? hitResult;
    return args;
  }

  private static _parseOrientedCastArgs(
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMask?: Layer,
    outHitResult?: HitResult
  ) {
    const args = PhysicsScene._parsedCastArgs;
    let hitResult: HitResult | undefined;
    let orientation = PhysicsScene._identityQuaternion;
    let distance = Number.MAX_VALUE;
    let mask = Layer.Everything;

    if (typeof orientationOrDistanceOrResult === "number") {
      distance = orientationOrDistanceOrResult;
      if (distanceOrResult?.constructor === HitResult) {
        hitResult = distanceOrResult;
      }
    } else if (orientationOrDistanceOrResult?.constructor === HitResult) {
      hitResult = orientationOrDistanceOrResult;
    } else if (orientationOrDistanceOrResult?.constructor === Quaternion) {
      orientation = orientationOrDistanceOrResult;
      if (typeof distanceOrResult === "number") {
        distance = distanceOrResult;
        if (typeof layerMask === "number") {
          mask = layerMask;
        }
      }
    }

    args.orientation = orientation;
    args.distance = distance;
    args.layerMask = mask;
    args.hitResult = outHitResult ?? hitResult;
    return args;
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
  private readonly _triggerReceivers = new Map<number, TriggerReceivers>();
  private _triggerStepStamp = 0;

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);
  private _contactEventConsumerCount = 0;

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
      Collider._getLayerIndex(layer1),
      Collider._getLayerIndex(layer2)
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
      Collider._getLayerIndex(layer1),
      Collider._getLayerIndex(layer2),
      isCollide
    );
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

    const writer = hitResult && HitResultWriter._acquire(hitResult);
    let result = false;
    if (normalizedDirection) {
      result = this._nativePhysicsScene.raycast(ray.origin, normalizedDirection, distance, layerMask, writer?._onHit);
    }
    writer?._finish();
    return result;
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

    const normalizedDirection = distance > 0 ? this._syncCastDirection(ray.direction) : null;
    const writer = HitResultWriter._acquire(outHitResults);
    if (normalizedDirection) {
      this._nativePhysicsScene.raycastAll(ray.origin, normalizedDirection, distance, layerMask, writer._onHit);
    }
    return writer._finish();
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

    const writer = hitResult && HitResultWriter._acquire(hitResult);
    let result = false;
    if (normalizedDirection) {
      result = this._nativePhysicsScene.boxCast(
        center,
        orientation,
        halfExtents,
        normalizedDirection,
        distance,
        mask,
        writer?._onHit
      );
    }
    writer?._finish();
    return result;
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
      distance > 0 && isValidPositiveFloat32(radius) ? this._syncCastDirection(direction) : null;

    const writer = hitResult && HitResultWriter._acquire(hitResult);
    let result = false;
    if (normalizedDirection) {
      result = this._nativePhysicsScene.sphereCast(
        center,
        radius,
        normalizedDirection,
        distance,
        layerMask,
        writer?._onHit
      );
    }
    writer?._finish();
    return result;
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

    const cylinderHeight = height - 2 * radius;
    const halfCylinderHeight = cylinderHeight * 0.5;
    const normalizedDirection =
      distance > 0 && isValidPositiveFloat32(radius) && height >= 0 && Number.isFinite(Math.fround(halfCylinderHeight))
        ? this._syncCastDirection(direction)
        : null;

    const writer = hitResult && HitResultWriter._acquire(hitResult);
    let result = false;
    if (normalizedDirection) {
      const onHit = writer?._onHit;
      result = isValidPositiveFloat32(halfCylinderHeight)
        ? this._nativePhysicsScene.capsuleCast(
            center,
            radius,
            halfCylinderHeight,
            orientation,
            normalizedDirection,
            distance,
            mask,
            onHit
          )
        : this._nativePhysicsScene.sphereCast(center, radius, normalizedDirection, distance, mask, onHit);
    }
    writer?._finish();
    return result;
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
    if (isValidPositiveFloat32(radius)) {
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
    const cylinderHeight = height - 2 * radius;
    const halfCylinderHeight = cylinderHeight * 0.5;
    let ids: ArrayLike<number> | undefined;
    if (isValidPositiveFloat32(radius) && height >= 0 && Number.isFinite(Math.fround(halfCylinderHeight))) {
      this._syncColliders(false);
      ids = isValidPositiveFloat32(halfCylinderHeight)
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
      if (count > 0) {
        const position = PhysicsScene._tempPosition;
        const rotation = PhysicsScene._tempRotation;
        for (let j = 0; j < count; j++) {
          bodies[j]._writeBack(position, rotation);
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
      this._checkBodyOrder(last);
    }
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
    HitResultWriter._gc();
    PhysicsScene._snapshotBuffers.length = 0;
    this._nativePhysicsScene?.gc();
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._gravity._onValueChanged = null;
    HitResultWriter._gc();
    PhysicsScene._snapshotBuffers.length = 0;
    this._triggerReceivers.clear();
    this._pendingSleeps = undefined;
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
          body = ancestor;
        }
      }
    }
  }

  private _dispatchEvents(events: IPhysicsEvents): void {
    const { contactEvents, contactEventCount, triggerEvents } = events;
    const triggerCount = triggerEvents.length;
    const triggerOffset = contactEventCount * 4;
    if (contactEventCount > 0 || triggerCount > 0) {
      // Snapshot both colliders and receivers before any script mutates Collider ownership or re-syncs the scene.
      const receivers = PhysicsScene._snapshotBuffers.pop() ?? [];
      PhysicsScene._snapshotReceivers(contactEvents, contactEventCount, receivers, 0);
      PhysicsScene._snapshotReceivers(triggerEvents, triggerCount, receivers, triggerOffset);

      if (contactEventCount > 0) {
        const collision = (this._collision ||= new Collision());
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
        collision._nativeCollision = null!;
        collision.collider = null!;
        collision.selfCollider = null!;
      }

      if (triggerCount > 0) {
        const triggerReceivers = this._triggerReceivers;
        const stamp = ++this._triggerStepStamp;
        let liveCount = 0;
        for (let i = 0; i < triggerCount; i++) {
          const event = triggerEvents[i];
          const base = triggerOffset + i * 4;
          let collider0 = <Collider>receivers[base];
          let cur0 = receivers[base + 1];
          let collider1 = <Collider>receivers[base + 2];
          let cur1 = receivers[base + 3];
          let small = collider0._id;
          let big = collider1._id;
          if (small > big) {
            const tmpId = small;
            small = big;
            big = tmpId;
            const tmpCollider = collider0;
            collider0 = collider1;
            collider1 = tmpCollider;
            const tmpCur = cur0;
            cur0 = cur1;
            cur1 = tmpCur;
          }
          const key = PhysicsScene._triggerPairKey(small, big);
          const state = event.state;
          if (state === PhysicsEventState.Stay) {
            const entry = triggerReceivers.get(key);
            if (entry) {
              entry.stamp = stamp;
              liveCount++;
              const prev0 = entry.receiver0;
              if (prev0 === cur0) {
                PhysicsScene._dispatchScripts(state, cur0, collider0, collider1);
              } else {
                entry.receiver0 = cur0;
                PhysicsScene._dispatchTriggerOwnerChange(prev0, cur0, collider0, collider1);
              }
              const prev1 = entry.receiver1;
              if (prev1 === cur1) {
                PhysicsScene._dispatchScripts(state, cur1, collider1, collider0);
              } else {
                entry.receiver1 = cur1;
                PhysicsScene._dispatchTriggerOwnerChange(prev1, cur1, collider1, collider0);
              }
            } else {
              PhysicsScene._dispatchScripts(state, cur0, collider0, collider1);
              PhysicsScene._dispatchScripts(state, cur1, collider1, collider0);
            }
          } else if (state === PhysicsEventState.Enter) {
            triggerReceivers.set(key, { receiver0: cur0, receiver1: cur1, stamp });
            liveCount++;
            PhysicsScene._dispatchScripts(state, cur0, collider0, collider1);
            PhysicsScene._dispatchScripts(state, cur1, collider1, collider0);
          } else {
            const entry = triggerReceivers.get(key);
            entry && triggerReceivers.delete(key);
            const target0 =
              !entry || entry.receiver0 === cur0 || entry.receiver0.entity === cur0.entity ? cur0 : entry.receiver0;
            const target1 =
              !entry || entry.receiver1 === cur1 || entry.receiver1.entity === cur1.entity ? cur1 : entry.receiver1;
            PhysicsScene._dispatchScripts(state, target0, collider0, collider1);
            PhysicsScene._dispatchScripts(state, target1, collider1, collider0);
          }
        }
        if (triggerReceivers.size > liveCount) {
          triggerReceivers.forEach(PhysicsScene._pruneTriggerReceiver, this);
        }
      }
      // Clear active slots in place without shrinking length so pooled arrays keep their backing storage.
      const totalSlots = triggerOffset + triggerCount * 4;
      for (let i = 0; i < totalSlots; i++) {
        receivers[i] = null!;
      }
      PhysicsScene._snapshotBuffers.push(receivers);
    }
    if (triggerCount === 0) {
      this._triggerReceivers.size > 0 && this._triggerReceivers.clear();
    }
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

/**
 * Holds caller output only while its synchronous physics query is active.
 * @internal
 */
class HitResultWriter {
  private static readonly _idle: HitResultWriter[] = [];
  private static readonly _hitPool: HitResult[] = [];

  static _acquire(output: HitResult | HitResult[]): HitResultWriter {
    const writer = HitResultWriter._idle.pop() ?? new HitResultWriter();
    writer._output = output;
    return writer;
  }

  static _gc(): void {
    HitResultWriter._idle.length = 0;
    HitResultWriter._hitPool.length = 0;
  }

  private static _clear(hit: HitResult): void {
    hit.entity = null;
    hit.collider = null;
    hit.distance = 0;
    hit.point.set(0, 0, 0);
    hit.normal.set(0, 0, 0);
  }

  private static _recycle(hit: HitResult): void {
    HitResultWriter._clear(hit);
    HitResultWriter._hitPool.push(hit);
  }

  // Output observers can start another query and overwrite the borrowed vectors.
  readonly _onHit = (id: number, distance: number, { x, y, z }: Vector3, { x: nx, y: ny, z: nz }: Vector3): void => {
    const collider = Engine._physicalObjectsMap[id];
    // Publishing an earlier hit may have destroyed this collider.
    if (!collider) return;
    const output = this._output!;
    const index = this._count++;
    const hit = Array.isArray(output) ? (output[index] ||= HitResultWriter._hitPool.pop() ?? new HitResult()) : output;
    hit.entity = collider.entity;
    hit.collider = collider;
    hit.distance = distance;
    hit.point.set(x, y, z);
    hit.normal.set(nx, ny, nz);
  };

  private _output?: HitResult | HitResult[];
  private _count = 0;
  private _discarded?: Set<HitResult>;

  _finish(): boolean {
    const output = this._output!;
    const count = this._count;
    if (Array.isArray(output)) {
      const length = output.length;
      if (count < length) {
        const discarded = (this._discarded ||= new Set<HitResult>());
        for (let i = count; i < length; i++) {
          const hit = output[i];
          if (hit) discarded.add(hit);
        }
        for (let i = 0; i < count; i++) {
          discarded.delete(output[i]);
        }
        // Detach discarded entries before clearing them. An output observer may start another query or throw.
        output.length = count;
        discarded.forEach(HitResultWriter._recycle);
        discarded.clear();
      }
    } else if (!count) {
      HitResultWriter._clear(output);
    }
    this._output = undefined;
    this._count = 0;
    HitResultWriter._idle.push(this);
    return count > 0;
  }
}

interface TriggerReceivers {
  receiver0: Rigidbody | Collider;
  receiver1: Rigidbody | Collider;
  stamp: number;
}
