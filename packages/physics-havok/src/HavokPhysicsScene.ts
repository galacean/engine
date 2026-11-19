import { DisorderedArray, Quaternion, Vector3 } from "@galacean/engine";
import { IContactEvent, IPhysicsEvents, IPhysicsScene, ITriggerEvent } from "@galacean/engine-design";
import { HavokCharacterController } from "./HavokCharacterController";
import { HavokCollider } from "./HavokCollider";
import { HavokDynamicCollider } from "./HavokDynamicCollider";
import { HavokPhysics } from "./HavokPhysics";
import {
  HavokEventBits,
  HavokShapeIdentity,
  HKVector3,
  HP_BodyId,
  HP_CollectorId,
  HP_ShapeId,
  HP_WorldId,
  ZERO_HANDLE
} from "./HavokTypes";
import { HavokJoint } from "./joint/HavokJoint";

// Power-of-two upper bound avoids float32 rounding error when reconstructing hit distance from fraction * clampedDist.
const MAX_QUERY_DISTANCE = 131072;
const MIN_QUERY_DIM = 1e-4;
const MAX_QUERY_SHAPE_CACHE = 64;

enum PhysicsEventState {
  Enter = 0,
  Stay = 1,
  Exit = 2
}

/**
 * Simulates colliders and executes scene queries through Havok WASM.
 */
export class HavokPhysicsScene implements IPhysicsScene {
  private static _tempPosition = new Vector3();
  private static _tempNormal = new Vector3();
  private static _tempQuat = new Quaternion();
  private static _tempPosB = new Vector3();
  private static _tempQuatB = new Quaternion();
  private static _identityQuat = new Quaternion(0, 0, 0, 1);

  /** @internal */
  _hkWorld: HP_WorldId;
  /** @internal */
  _worldAnchorBody: HP_BodyId;
  /** @internal */
  _contactEventsEnabled = false;

  private _havokPhysics: HavokPhysics;
  private _destroyed = false;
  private _colliders = new Set<HavokCollider>();
  private _dynamicColliders = new Set<HavokDynamicCollider>();
  private _controllers = new Set<HavokCharacterController>();
  private _joints = new Set<HavokJoint>();
  private _bodyToCollider = new Map<bigint, HavokCollider>();
  private _bodyToController = new Map<bigint, HavokCharacterController>();

  // Deferred shape/broadphase/filter flush queues
  private _dirtyShapeColliders = new Set<HavokCollider>();
  private _dirtyBroadphaseColliders = new Set<HavokCollider>();
  private _dirtyBroadphaseControllers = new Set<HavokCharacterController>();
  private _dirtyFilterColliders = new Set<HavokCollider>();
  private _dirtyFilterControllers = new Set<HavokCharacterController>();
  private _filterChangedShapeIds = new Set<number>();

  private _multiCollector: HP_CollectorId;
  private _collectorCapacity = 256;

  private _activeContactPairs = new Map<
    string,
    { shape0Id: number; shape1Id: number; isKinematicNonDynamic: boolean }
  >();
  private _activeKinematicContactCount = 0;
  private _activeKinematicShapeIds = new Set<number>();
  private _stepContactMap = new Map<string, StepContactBucket>();
  private _contactEvents: ContactEvent[] = [];
  private _contactEventCount = 0;

  // Scene-scoped trigger tracking with deferred removal & continuity
  private _removedShapeIds = new Set<number>();
  private _triggerOverlapCounts = new Map<string, number>();
  private _triggerPairMap = new Map<string, TriggerEvent>();
  private _activeTriggers = new DisorderedArray<TriggerEvent>();
  private _triggerEvents: TriggerEvent[] = [];
  private _triggerEventPool: TriggerEvent[] = [];

  private _physicsEvents: IPhysicsEvents = { contactEvents: [], contactEventCount: 0, triggerEvents: [] };
  private _overlapResultBuffer: number[] = [];
  private _overlapSeen = new Set<number>();

  // Bounded query-shape caches & reusable Embind scratch tuples to avoid per-query WASM shape alloc/release
  private _sphereQueryCache = new Map<number, CachedQueryShape>();
  private _boxQueryCache = new Map<string, CachedQueryShape>();
  private _capsuleQueryCache = new Map<string, CachedQueryShape>();
  private _lastBoxX = -1;
  private _lastBoxY = -1;
  private _lastBoxZ = -1;
  private _lastBoxEntry: CachedQueryShape | null = null;
  private _lastCapR = -1;
  private _lastCapHalfH = -1;
  private _lastCapEntry: CachedQueryShape | null = null;
  private _queryStart: HKVector3 = [0, 0, 0];
  private _queryEnd: HKVector3 = [0, 0, 0];
  private _queryRot: [number, number, number, number] = [0, 0, 0, 1];
  private _queryFilter: [number, number] = [0xffffffff, 0];

  constructor(havokPhysics: HavokPhysics) {
    this._havokPhysics = havokPhysics;
    const hk = havokPhysics._hk;

    this._hkWorld = hk.HP_World_Create()[1];
    hk.HP_World_SetGravity(this._hkWorld, [0, -9.81, 0]);
    hk.HP_World_SetSpeedLimit(this._hkWorld, 1e6, 1e6);

    // Hidden world anchor static body for null-connected joints and DOF-lock constraints
    this._worldAnchorBody = hk.HP_Body_Create()[1];
    hk.HP_Body_SetMotionType(this._worldAnchorBody, hk.MotionType.STATIC);
    hk.HP_Body_SetQTransform(this._worldAnchorBody, [
      [0, 0, 0],
      [0, 0, 0, 1]
    ]);
    hk.HP_World_AddBody(this._hkWorld, this._worldAnchorBody, false);

    this._multiCollector = hk.HP_QueryCollector_Create(this._collectorCapacity)[1];
    havokPhysics._registerScene(this);
  }

  /** @internal */
  _getMultiCollector(): HP_CollectorId {
    return this._multiCollector;
  }

  /** @internal */
  _markDirtyCollider(collider: HavokCollider): void {
    this._dirtyShapeColliders.add(collider);
  }

  /** @internal */
  _markBroadphaseDirty(collider: HavokCollider): void {
    if (this._colliders.has(collider)) {
      this._dirtyBroadphaseColliders.add(collider);
    }
  }

  /** @internal */
  _markControllerBroadphaseDirty(controller: HavokCharacterController): void {
    if (this._controllers.has(controller)) {
      this._dirtyBroadphaseControllers.add(controller);
    }
  }

  /** @internal */
  _reinsertBody(collider: HavokCollider, rebuildShape: boolean): void {
    this._dirtyShapeColliders.delete(collider);
    this._dirtyFilterColliders.delete(collider);
    this._dirtyBroadphaseColliders.delete(collider);
    if (rebuildShape) {
      collider._shapeDirty = false;
    }

    if (!this._colliders.has(collider)) {
      if (rebuildShape) {
        collider._rebuildBodyShape();
      }
      return;
    }

    const hk = this._havokPhysics._hk;
    const isDynamic = collider instanceof HavokDynamicCollider && !collider._isKinematicBody();
    const wasAsleep =
      isDynamic && hk.HP_Body_GetActivationState(collider._hkBody)[1].value === hk.ActivationState.INACTIVE.value;
    let linVel: HKVector3 | null = null;
    let angVel: HKVector3 | null = null;
    if (isDynamic && !wasAsleep) {
      linVel = hk.HP_Body_GetLinearVelocity(collider._hkBody)[1];
      angVel = hk.HP_Body_GetAngularVelocity(collider._hkBody)[1];
    }

    hk.HP_World_RemoveBody(this._hkWorld, collider._hkBody);
    if (rebuildShape) {
      collider._rebuildBodyShape();
    }
    hk.HP_World_AddBody(this._hkWorld, collider._hkBody, wasAsleep);

    if (isDynamic && !wasAsleep && linVel && angVel) {
      const curLin = hk.HP_Body_GetLinearVelocity(collider._hkBody)[1];
      if (
        Math.abs(curLin[0] - linVel[0]) > 1e-5 ||
        Math.abs(curLin[1] - linVel[1]) > 1e-5 ||
        Math.abs(curLin[2] - linVel[2]) > 1e-5
      ) {
        hk.HP_Body_SetLinearVelocity(collider._hkBody, linVel);
      }
      const curAng = hk.HP_Body_GetAngularVelocity(collider._hkBody)[1];
      if (
        Math.abs(curAng[0] - angVel[0]) > 1e-5 ||
        Math.abs(curAng[1] - angVel[1]) > 1e-5 ||
        Math.abs(curAng[2] - angVel[2]) > 1e-5
      ) {
        hk.HP_Body_SetAngularVelocity(collider._hkBody, angVel);
      }
    }

    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      const id = shapes[i]._id;
      this._markShapeTriggersPendingExit(id);
      this._filterChangedShapeIds.add(id);
    }
  }

  /** @internal */
  _flushDirtyColliders(): void {
    if (this._dirtyShapeColliders.size > 0) {
      Array.from(this._dirtyShapeColliders).forEach((col) => {
        if (col._shapeDirty) {
          this._reinsertBody(col, true);
        }
      });
      this._dirtyShapeColliders.clear();
    }
    if (this._dirtyBroadphaseColliders.size > 0) {
      Array.from(this._dirtyBroadphaseColliders).forEach((col) => {
        this._reinsertBody(col, false);
      });
      this._dirtyBroadphaseColliders.clear();
    }
    if (this._dirtyBroadphaseControllers.size > 0) {
      const hk = this._havokPhysics._hk;
      this._dirtyBroadphaseControllers.forEach((ctrl) => {
        if (!this._controllers.has(ctrl) || !ctrl._hkBody) return;
        this._dirtyFilterControllers.delete(ctrl);
        hk.HP_World_RemoveBody(this._hkWorld, ctrl._hkBody);
        hk.HP_World_AddBody(this._hkWorld, ctrl._hkBody, false);
        this._markShapeTriggersPendingExit(ctrl._id);
        this._filterChangedShapeIds.add(ctrl._id);
      });
      this._dirtyBroadphaseControllers.clear();
    }
  }

  /** @internal */
  _addJoint(joint: HavokJoint): void {
    this._joints.add(joint);
  }

  /** @internal */
  _removeJoint(joint: HavokJoint): void {
    this._joints.delete(joint);
  }

  /** @internal */
  _registerControllerBody(controller: HavokCharacterController, body: HP_BodyId): void {
    this._bodyToController.set(body[0], controller);
    this._dirtyBroadphaseControllers.delete(controller);
  }

  /** @internal */
  _unregisterControllerBody(body: HP_BodyId): void {
    this._bodyToController.delete(body[0]);
  }

  /** @internal */
  _invalidateShapePairs(collider: HavokCollider, shapeId: number): void {
    if (!this._colliders.has(collider)) return;
    this._markShapeTriggersPendingExit(shapeId);
    this._filterChangedShapeIds.add(shapeId);
    this._dirtyFilterColliders.add(collider);
  }

  /** @internal */
  _onControllerFilterChanged(controller: HavokCharacterController): void {
    if (!this._controllers.has(controller)) return;
    this._markShapeTriggersPendingExit(controller._id);
    this._filterChangedShapeIds.add(controller._id);
    this._dirtyFilterControllers.add(controller);
  }

  /** @internal */
  _onLayerMatrixChanged(): void {
    this._colliders.forEach((collider) => {
      const shapes = collider._shapes;
      for (let i = 0, n = shapes.length; i < n; i++) {
        shapes[i]._syncLayerFilter();
        this._markShapeTriggersPendingExit(shapes[i]._id);
        this._filterChangedShapeIds.add(shapes[i]._id);
      }
      this._dirtyFilterColliders.add(collider);
    });
    this._controllers.forEach((ctrl) => {
      ctrl._syncLayerFilter();
      this._markShapeTriggersPendingExit(ctrl._id);
      this._filterChangedShapeIds.add(ctrl._id);
      this._dirtyFilterControllers.add(ctrl);
    });
  }

  /** @internal */
  _addColliderShape(id: number): void {
    // If re-added before the next step (reparent/static<->dynamic/replaceShape), keep trigger pairs alive
    this._removedShapeIds.delete(id);
  }

  /** @internal */
  _removeColliderShape(id: number): void {
    // Mark active triggers as Exit; if re-added before next step, Havok re-detecting them restores Stay.
    // Otherwise _releaseRemovedShapes() drops them silently.
    this._markShapeTriggersPendingExit(id);
    this._removedShapeIds.add(id);

    // Collision pairs restart with onCollisionEnter when a collider moves actors
    const toDeleteContactKeys: string[] = [];
    this._activeContactPairs.forEach((pair, key) => {
      if (pair.shape0Id === id || pair.shape1Id === id) {
        toDeleteContactKeys.push(key);
      }
    });
    for (let i = 0; i < toDeleteContactKeys.length; i++) {
      const key = toDeleteContactKeys[i];
      const pair = this._activeContactPairs.get(key);
      if (pair?.isKinematicNonDynamic) {
        this._activeKinematicContactCount--;
      }
      this._activeContactPairs.delete(key);
    }
  }

  setGravity(gravity: Vector3): void {
    this._havokPhysics._hk.HP_World_SetGravity(this._hkWorld, [gravity.x, gravity.y, gravity.z]);
  }

  addCollider(collider: HavokCollider): void {
    if (this._colliders.has(collider)) return;
    this._colliders.add(collider);
    this._bodyToCollider.set(collider._hkBody[0], collider);
    if (collider instanceof HavokDynamicCollider) {
      this._dynamicColliders.add(collider);
    }
    collider._flushShapeIfDirty();
    this._havokPhysics._hk.HP_World_AddBody(this._hkWorld, collider._hkBody, false);
    collider._onAddedToScene(this);

    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._addColliderShape(shapes[i]._id);
    }
  }

  removeCollider(collider: HavokCollider): void {
    if (!this._colliders.has(collider)) return;
    this._colliders.delete(collider);
    this._dirtyShapeColliders.delete(collider);
    this._dirtyBroadphaseColliders.delete(collider);
    this._dirtyFilterColliders.delete(collider);
    this._bodyToCollider.delete(collider._hkBody[0]);
    if (collider instanceof HavokDynamicCollider) {
      this._dynamicColliders.delete(collider);
    }
    const hk = this._havokPhysics._hk;
    if (hk) {
      hk.HP_World_RemoveBody(this._hkWorld, collider._hkBody);
    }
    collider._onRemovedFromScene();
    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeColliderShape(shapes[i]._id);
    }
  }

  addCharacterController(controller: HavokCharacterController): void {
    if (this._controllers.has(controller)) return;
    this._controllers.add(controller);
    controller._addToScene(this);
  }

  removeCharacterController(controller: HavokCharacterController): void {
    if (!this._controllers.has(controller)) return;
    this._controllers.delete(controller);
    this._dirtyBroadphaseControllers.delete(controller);
    this._dirtyFilterControllers.delete(controller);
    controller._removeFromScene();
  }

  update(elapsedTime: number): void {
    this._contactEventCount = 0;

    // 1. Drop trigger pairs of shapes removed since last step and NOT re-added
    this._releaseRemovedShapes();

    // 2. Flush deferred container rebuilds & broadphase filter invalidations
    //    (HP_World_Step natively updates broadphase for moved bodies, so clear _dirtyBroadphaseColliders here)
    this._flushDirtyCollidersForStep();
    this._flushDirtyFilters();

    // 3. Configure ideal step time BEFORE kinematic targets & forces so HP_Body_SetTargetQTransform uses exact dt
    const hk = this._havokPhysics._hk;
    hk.HP_World_SetIdealStepTime(this._hkWorld, elapsedTime);

    // 4. Flush pending kinematic targets & accumulated forces/torques
    this._dynamicColliders.forEach((col) => {
      col._preStep(elapsedTime);
    });

    // 5. Joint pre-step hooks (e.g., HingeJoint freeSpin)
    this._joints.forEach((j) => {
      j._preStep(elapsedTime);
    });

    // 6. Step Havok world
    hk.HP_World_Step(this._hkWorld, elapsedTime);

    // 7. Post-step dynamic velocity clamps, kinematic velocity reset & breakable joint impulse checks
    this._dynamicColliders.forEach((col) => {
      col._postStep();
    });
    this._joints.forEach((j) => {
      j._checkBreak(elapsedTime);
    });

    // 8. Harvest collision & trigger events immediately after step
    if (this._contactEventsEnabled) {
      this._collectCollisionEvents();
    }
    this._collectTriggerEvents();
    this._filterChangedShapeIds.clear();
  }

  setContactEventEnabled(enabled: boolean): void {
    this._contactEventsEnabled = enabled;
    this._colliders.forEach((col) => {
      col._updateEventMask(enabled);
    });
    if (!enabled) {
      this._contactEventCount = 0;
      this._activeContactPairs.clear();
      this._activeKinematicContactCount = 0;
    }
  }

  updateEvents(): IPhysicsEvents {
    const physicsEvents = this._physicsEvents;
    const activeTriggers = this._activeTriggers;
    const triggerEvents = this._triggerEvents;
    const pool = this._triggerEventPool;

    triggerEvents.length = 0;
    activeTriggers.forEach((event, i) => {
      event.dispatchState = event.state;
      triggerEvents.push(event);
      if (event.state === PhysicsEventState.Enter) {
        event.state = PhysicsEventState.Stay;
      } else if (event.state === PhysicsEventState.Exit) {
        activeTriggers.deleteByIndex(i);
        const key = `${event.index1}_${event.index2}`;
        if (this._triggerPairMap.get(key) === event) {
          this._triggerPairMap.delete(key);
        }
        this._triggerOverlapCounts.delete(key);
        pool.push(event);
      }
    });

    physicsEvents.contactEvents = this._contactEvents;
    physicsEvents.contactEventCount = this._contactEventCount;
    physicsEvents.triggerEvents = triggerEvents;
    return physicsEvents;
  }

  raycast(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): boolean {
    if (distance <= 0) return false;
    const filterMask = layerMask >>> 0;
    if (filterMask === 0) return false;
    this._flushDirtyColliders();

    const clampedDist = Math.min(distance, MAX_QUERY_DISTANCE);
    const start = this._queryStart;
    start[0] = origin.x;
    start[1] = origin.y;
    start[2] = origin.z;
    const end = this._queryEnd;
    end[0] = origin.x + direction.x * clampedDist;
    end[1] = origin.y + direction.y * clampedDist;
    end[2] = origin.z + direction.z * clampedDist;

    const numHits = this._runRayQueryWithGrow(start, end, filterMask);
    const hk = this._havokPhysics._hk;
    let bestFrac = 2;
    let bestShapeId = -1;
    let bestPx = 0,
      bestPy = 0,
      bestPz = 0;
    let bestNx = 0,
      bestNy = 0,
      bestNz = 0;

    for (let i = 0; i < numHits; i++) {
      const [frac, cp] = hk.HP_QueryCollector_GetCastRayResult(this._multiCollector, i)[1];
      if (frac <= 0 || frac >= bestFrac) continue;
      const shape = this._resolveQueryContactShape(cp[0][0], cp[1][0]);
      if (!shape || !shape._isSceneQuery) continue;
      bestFrac = frac;
      bestShapeId = shape._id;
      const p = cp[3];
      const n = cp[4];
      bestPx = p[0];
      bestPy = p[1];
      bestPz = p[2];
      bestNx = n[0];
      bestNy = n[1];
      bestNz = n[2];
    }

    if (bestShapeId === -1) return false;
    if (outHitResult) {
      const pos = HavokPhysicsScene._tempPosition;
      const norm = HavokPhysicsScene._tempNormal;
      pos.set(bestPx, bestPy, bestPz);
      norm.set(bestNx, bestNy, bestNz);
      outHitResult(bestShapeId, bestFrac * clampedDist, pos, norm);
    }
    return true;
  }

  raycastAll(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    onHit: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): void {
    if (distance <= 0) return;
    const filterMask = layerMask >>> 0;
    if (filterMask === 0) return;
    this._flushDirtyColliders();

    const clampedDist = Math.min(distance, MAX_QUERY_DISTANCE);
    const start = this._queryStart;
    start[0] = origin.x;
    start[1] = origin.y;
    start[2] = origin.z;
    const end = this._queryEnd;
    end[0] = origin.x + direction.x * clampedDist;
    end[1] = origin.y + direction.y * clampedDist;
    end[2] = origin.z + direction.z * clampedDist;

    const numHits = this._runRayQueryWithGrow(start, end, filterMask);
    const hk = this._havokPhysics._hk;

    // Match PhysX default raycastAll (without eMESH_MULTIPLE): keep the closest hit per collider shape
    const closestByShape = new Map<
      number,
      {
        id: number;
        frac: number;
        dist: number;
        px: number;
        py: number;
        pz: number;
        nx: number;
        ny: number;
        nz: number;
      }
    >();
    for (let i = 0; i < numHits; i++) {
      const [frac, cp] = hk.HP_QueryCollector_GetCastRayResult(this._multiCollector, i)[1];
      if (frac <= 0) continue;
      const shape = this._resolveQueryContactShape(cp[0][0], cp[1][0]);
      if (!shape || !shape._isSceneQuery) continue;
      const existing = closestByShape.get(shape._id);
      if (existing && frac >= existing.frac) continue;
      const p = cp[3];
      const n = cp[4];
      if (existing) {
        existing.frac = frac;
        existing.dist = frac * clampedDist;
        existing.px = p[0];
        existing.py = p[1];
        existing.pz = p[2];
        existing.nx = n[0];
        existing.ny = n[1];
        existing.nz = n[2];
      } else {
        closestByShape.set(shape._id, {
          id: shape._id,
          frac,
          dist: frac * clampedDist,
          px: p[0],
          py: p[1],
          pz: p[2],
          nx: n[0],
          ny: n[1],
          nz: n[2]
        });
      }
    }

    const pos = HavokPhysicsScene._tempPosition;
    const norm = HavokPhysicsScene._tempNormal;
    closestByShape.forEach((h) => {
      pos.set(h.px, h.py, h.pz);
      norm.set(h.nx, h.ny, h.nz);
      onHit(h.id, h.dist, pos, norm);
    });
  }

  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const mask = layerMask >>> 0;
    if (distance <= 0 || mask === 0) return false;
    this._flushDirtyColliders();
    const sx = Math.max(Math.abs(halfExtents.x) * 2, MIN_QUERY_DIM);
    const sy = Math.max(Math.abs(halfExtents.y) * 2, MIN_QUERY_DIM);
    const sz = Math.max(Math.abs(halfExtents.z) * 2, MIN_QUERY_DIM);
    const qShape = this._getCachedBoxQueryShape(sx, sy, sz, mask);
    return this._shapeCastSingle(qShape, center, orientation, direction, distance, outHitResult);
  }

  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const mask = layerMask >>> 0;
    if (distance <= 0 || mask === 0) return false;
    this._flushDirtyColliders();
    const qShape = this._getCachedSphereQueryShape(Math.max(Math.abs(radius), MIN_QUERY_DIM), mask);
    return this._shapeCastSingle(qShape, center, HavokPhysicsScene._identityQuat, direction, distance, outHitResult);
  }

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
    const mask = layerMask >>> 0;
    if (distance <= 0 || mask === 0) return false;
    this._flushDirtyColliders();
    const halfH = Math.max(Math.abs(height) * 0.5, MIN_QUERY_DIM);
    const r = Math.max(Math.abs(radius), MIN_QUERY_DIM);
    const qShape = this._getCachedCapsuleQueryShape(r, halfH, mask);
    return this._shapeCastSingle(qShape, center, orientation, direction, distance, outHitResult);
  }

  overlapBoxAll(center: Vector3, orientation: Quaternion, halfExtents: Vector3, layerMask: number): ArrayLike<number> {
    const out = this._overlapResultBuffer;
    out.length = 0;
    const mask = layerMask >>> 0;
    if (mask === 0) return out;
    this._flushDirtyColliders();
    const sx = Math.max(Math.abs(halfExtents.x) * 2, MIN_QUERY_DIM);
    const sy = Math.max(Math.abs(halfExtents.y) * 2, MIN_QUERY_DIM);
    const sz = Math.max(Math.abs(halfExtents.z) * 2, MIN_QUERY_DIM);
    const qShape = this._getCachedBoxQueryShape(sx, sy, sz, mask);
    return this._overlapShapeAll(qShape, center, orientation);
  }

  overlapSphereAll(center: Vector3, radius: number, layerMask: number): ArrayLike<number> {
    const out = this._overlapResultBuffer;
    out.length = 0;
    const mask = layerMask >>> 0;
    if (mask === 0) return out;
    this._flushDirtyColliders();
    const qShape = this._getCachedSphereQueryShape(Math.max(Math.abs(radius), MIN_QUERY_DIM), mask);
    return this._overlapShapeAll(qShape, center, HavokPhysicsScene._identityQuat);
  }

  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    layerMask: number
  ): ArrayLike<number> {
    const out = this._overlapResultBuffer;
    out.length = 0;
    const mask = layerMask >>> 0;
    if (mask === 0) return out;
    this._flushDirtyColliders();
    const halfH = Math.max(Math.abs(height) * 0.5, MIN_QUERY_DIM);
    const r = Math.max(Math.abs(radius), MIN_QUERY_DIM);
    const qShape = this._getCachedCapsuleQueryShape(r, halfH, mask);
    return this._overlapShapeAll(qShape, center, orientation);
  }

  gc(): void {
    this._contactEvents.length = this._contactEventCount;
    this._releaseQueryShapeCaches();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._havokPhysics._unregisterScene(this);
    const hk = this._havokPhysics._hk;
    Array.from(this._joints).forEach((j) => {
      j.destroy();
    });
    this._joints.clear();
    Array.from(this._controllers).forEach((ctrl) => {
      this.removeCharacterController(ctrl);
    });
    Array.from(this._colliders).forEach((col) => {
      this.removeCollider(col);
    });
    this._releaseQueryShapeCaches();
    if (hk) {
      hk.HP_QueryCollector_Release(this._multiCollector);
      hk.HP_World_RemoveBody(this._hkWorld, this._worldAnchorBody);
      hk.HP_Body_Release(this._worldAnchorBody);
      hk.HP_World_Release(this._hkWorld);
    }
    this._colliders.clear();
    this._dynamicColliders.clear();
    this._controllers.clear();
    this._dirtyShapeColliders.clear();
    this._dirtyBroadphaseColliders.clear();
    this._dirtyBroadphaseControllers.clear();
    this._dirtyFilterColliders.clear();
    this._dirtyFilterControllers.clear();
    this._filterChangedShapeIds.clear();
    this._bodyToCollider.clear();
    this._bodyToController.clear();
    this._activeContactPairs.clear();
    this._activeKinematicContactCount = 0;
    this._activeKinematicShapeIds.clear();
    this._stepContactMap.clear();
    this._contactEvents.length = 0;
    this._contactEventCount = 0;
    this._removedShapeIds.clear();
    this._triggerOverlapCounts.clear();
    this._triggerPairMap.clear();
    this._activeTriggers.length = 0;
    this._activeTriggers.garbageCollection();
    this._triggerEvents.length = 0;
    this._triggerEventPool.length = 0;
    this._overlapResultBuffer.length = 0;
    this._overlapSeen.clear();
    this._physicsEvents.contactEvents = this._contactEvents;
    this._physicsEvents.contactEventCount = 0;
    this._physicsEvents.triggerEvents = this._triggerEvents;
  }

  private _markShapeTriggersPendingExit(id: number): void {
    this._activeTriggers.forEach((ev) => {
      if (ev.index1 === id || ev.index2 === id) {
        ev.state = PhysicsEventState.Exit;
        this._triggerOverlapCounts.set(`${ev.index1}_${ev.index2}`, 0);
      }
    });
  }

  private _releaseRemovedShapes(): void {
    const removed = this._removedShapeIds;
    if (removed.size === 0) return;

    const activeTriggers = this._activeTriggers;
    const pool = this._triggerEventPool;
    activeTriggers.forEach((ev, i) => {
      if (removed.has(ev.index1) || removed.has(ev.index2)) {
        activeTriggers.deleteByIndex(i);
        const key = `${ev.index1}_${ev.index2}`;
        if (this._triggerPairMap.get(key) === ev) {
          this._triggerPairMap.delete(key);
        }
        this._triggerOverlapCounts.delete(key);
        pool.push(ev);
      }
    });
    removed.clear();
  }

  private _flushDirtyCollidersForStep(): void {
    if (this._dirtyShapeColliders.size > 0) {
      Array.from(this._dirtyShapeColliders).forEach((col) => {
        if (col._shapeDirty) {
          this._reinsertBody(col, true);
        }
      });
      this._dirtyShapeColliders.clear();
    }
    this._dirtyBroadphaseColliders.clear();
    this._dirtyBroadphaseControllers.clear();
  }

  private _flushDirtyFilters(): void {
    const hk = this._havokPhysics._hk;
    if (this._dirtyFilterColliders.size > 0) {
      Array.from(this._dirtyFilterColliders).forEach((col) => {
        this._reinsertBody(col, false);
      });
      this._dirtyFilterColliders.clear();
    }

    if (this._dirtyFilterControllers.size > 0) {
      this._dirtyFilterControllers.forEach((ctrl) => {
        if (!this._controllers.has(ctrl) || !ctrl._hkBody) return;
        hk.HP_World_RemoveBody(this._hkWorld, ctrl._hkBody);
        hk.HP_World_AddBody(this._hkWorld, ctrl._hkBody, false);
      });
      this._dirtyFilterControllers.clear();
    }
  }

  private _growCollector(): void {
    const hk = this._havokPhysics._hk;
    hk.HP_QueryCollector_Release(this._multiCollector);
    this._collectorCapacity *= 2;
    this._multiCollector = hk.HP_QueryCollector_Create(this._collectorCapacity)[1];
  }

  private _applyQueryShapeFilter(entry: CachedQueryShape, layerMask: number): HP_ShapeId {
    if (entry.filterMask !== layerMask) {
      entry.filterMask = layerMask;
      const filter = this._queryFilter;
      filter[0] = 0xffffffff;
      filter[1] = layerMask;
      this._havokPhysics._hk.HP_Shape_SetFilterInfo(entry.shape, filter);
    }
    return entry.shape;
  }

  private _evictOldestQueryShape<K>(cache: Map<K, CachedQueryShape>): void {
    if (cache.size < MAX_QUERY_SHAPE_CACHE) return;
    const oldest = cache.entries().next();
    if (oldest.done) return;
    const [key, entry] = oldest.value;
    cache.delete(key);
    this._havokPhysics._hk.HP_Shape_Release(entry.shape);
  }

  private _getCachedSphereQueryShape(radius: number, layerMask: number): HP_ShapeId {
    const cache = this._sphereQueryCache;
    let entry = cache.get(radius);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const shape = this._havokPhysics._hk.HP_Shape_CreateSphere([0, 0, 0], radius)[1];
      entry = { shape, filterMask: -1 };
      cache.set(radius, entry);
    }
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _getCachedBoxQueryShape(sx: number, sy: number, sz: number, layerMask: number): HP_ShapeId {
    if (this._lastBoxEntry && this._lastBoxX === sx && this._lastBoxY === sy && this._lastBoxZ === sz) {
      return this._applyQueryShapeFilter(this._lastBoxEntry, layerMask);
    }
    const key = `${sx}_${sy}_${sz}`;
    const cache = this._boxQueryCache;
    let entry = cache.get(key);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const shape = this._havokPhysics._hk.HP_Shape_CreateBox([0, 0, 0], [0, 0, 0, 1], [sx, sy, sz])[1];
      entry = { shape, filterMask: -1 };
      cache.set(key, entry);
    }
    this._lastBoxX = sx;
    this._lastBoxY = sy;
    this._lastBoxZ = sz;
    this._lastBoxEntry = entry;
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _getCachedCapsuleQueryShape(radius: number, halfH: number, layerMask: number): HP_ShapeId {
    if (this._lastCapEntry && this._lastCapR === radius && this._lastCapHalfH === halfH) {
      return this._applyQueryShapeFilter(this._lastCapEntry, layerMask);
    }
    const key = `${radius}_${halfH}`;
    const cache = this._capsuleQueryCache;
    let entry = cache.get(key);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const shape = this._havokPhysics._hk.HP_Shape_CreateCapsule([-halfH, 0, 0], [halfH, 0, 0], radius)[1];
      entry = { shape, filterMask: -1 };
      cache.set(key, entry);
    }
    this._lastCapR = radius;
    this._lastCapHalfH = halfH;
    this._lastCapEntry = entry;
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _releaseQueryShapeCaches(): void {
    const hk = this._havokPhysics._hk;
    if (hk) {
      this._sphereQueryCache.forEach((entry) => hk.HP_Shape_Release(entry.shape));
      this._boxQueryCache.forEach((entry) => hk.HP_Shape_Release(entry.shape));
      this._capsuleQueryCache.forEach((entry) => hk.HP_Shape_Release(entry.shape));
    }
    this._sphereQueryCache.clear();
    this._boxQueryCache.clear();
    this._capsuleQueryCache.clear();
    this._lastBoxEntry = null;
    this._lastBoxX = -1;
    this._lastBoxY = -1;
    this._lastBoxZ = -1;
    this._lastCapEntry = null;
    this._lastCapR = -1;
    this._lastCapHalfH = -1;
  }

  private _runRayQueryWithGrow(start: HKVector3, end: HKVector3, layerMask: number): number {
    const hk = this._havokPhysics._hk;
    const filter = this._queryFilter;
    filter[0] = 0xffffffff;
    filter[1] = layerMask;
    while (true) {
      hk.HP_World_CastRayWithCollector(this._hkWorld, this._multiCollector, [start, end, filter, true, ZERO_HANDLE]);
      const numHits = hk.HP_QueryCollector_GetNumHits(this._multiCollector)[1];
      if (numHits < this._collectorCapacity || this._collectorCapacity >= 16384) {
        return numHits;
      }
      this._growCollector();
    }
  }

  private _shapeCastSingle(
    qShape: HP_ShapeId,
    center: Vector3,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const hk = this._havokPhysics._hk;
    const clampedDist = Math.min(distance, MAX_QUERY_DISTANCE);
    const start = this._queryStart;
    start[0] = center.x;
    start[1] = center.y;
    start[2] = center.z;
    const end = this._queryEnd;
    end[0] = center.x + direction.x * clampedDist;
    end[1] = center.y + direction.y * clampedDist;
    end[2] = center.z + direction.z * clampedDist;
    const rot = this._queryRot;
    if (orientation === HavokPhysicsScene._identityQuat) {
      rot[0] = 0;
      rot[1] = 0;
      rot[2] = 0;
      rot[3] = 1;
    } else {
      HavokPhysicsScene._tempQuat.set(0, 0, 0, 1);
      Quaternion.normalize(orientation, HavokPhysicsScene._tempQuat);
      const q = HavokPhysicsScene._tempQuat;
      rot[0] = q.x;
      rot[1] = q.y;
      rot[2] = q.z;
      rot[3] = q.w;
    }

    let numHits: number;
    while (true) {
      hk.HP_World_ShapeCastWithCollector(this._hkWorld, this._multiCollector, [
        qShape,
        rot,
        start,
        end,
        true,
        ZERO_HANDLE
      ]);
      numHits = hk.HP_QueryCollector_GetNumHits(this._multiCollector)[1];
      if (numHits < this._collectorCapacity || this._collectorCapacity >= 16384) {
        break;
      }
      this._growCollector();
    }

    let bestFrac = 2;
    let bestShapeId = -1;
    let bestPx = 0,
      bestPy = 0,
      bestPz = 0;
    let bestNx = 0,
      bestNy = 0,
      bestNz = 0;

    for (let i = 0; i < numHits; i++) {
      const [frac, , hitData] = hk.HP_QueryCollector_GetShapeCastResult(this._multiCollector, i)[1];
      if (frac <= 0 || frac >= bestFrac) continue;
      const shape = this._resolveQueryContactShape(hitData[0][0], hitData[1][0]);
      if (!shape || !shape._isSceneQuery) continue;
      bestFrac = frac;
      bestShapeId = shape._id;
      const p = hitData[3];
      const n = hitData[4];
      bestPx = p[0];
      bestPy = p[1];
      bestPz = p[2];
      bestNx = n[0];
      bestNy = n[1];
      bestNz = n[2];
    }

    if (bestShapeId === -1) return false;
    if (outHitResult) {
      const pos = HavokPhysicsScene._tempPosition;
      const norm = HavokPhysicsScene._tempNormal;
      pos.set(bestPx, bestPy, bestPz);
      norm.set(bestNx, bestNy, bestNz);
      outHitResult(bestShapeId, bestFrac * clampedDist, pos, norm);
    }
    return true;
  }

  private _overlapShapeAll(qShape: HP_ShapeId, center: Vector3, orientation: Quaternion): ArrayLike<number> {
    const hk = this._havokPhysics._hk;
    const pos = this._queryStart;
    pos[0] = center.x;
    pos[1] = center.y;
    pos[2] = center.z;
    const rot = this._queryRot;
    if (orientation === HavokPhysicsScene._identityQuat) {
      rot[0] = 0;
      rot[1] = 0;
      rot[2] = 0;
      rot[3] = 1;
    } else {
      HavokPhysicsScene._tempQuat.set(0, 0, 0, 1);
      Quaternion.normalize(orientation, HavokPhysicsScene._tempQuat);
      const q = HavokPhysicsScene._tempQuat;
      rot[0] = q.x;
      rot[1] = q.y;
      rot[2] = q.z;
      rot[3] = q.w;
    }

    let numHits: number;
    while (true) {
      hk.HP_World_ShapeProximityWithCollector(this._hkWorld, this._multiCollector, [
        qShape,
        pos,
        rot,
        0,
        true,
        ZERO_HANDLE
      ]);
      numHits = hk.HP_QueryCollector_GetNumHits(this._multiCollector)[1];
      if (numHits < this._collectorCapacity || this._collectorCapacity >= 16384) {
        break;
      }
      this._growCollector();
    }

    const out = this._overlapResultBuffer;
    const seen = this._overlapSeen;
    out.length = 0;
    seen.clear();

    for (let i = 0; i < numHits; i++) {
      const [, , hitData] = hk.HP_QueryCollector_GetShapeProximityResult(this._multiCollector, i)[1];
      const shape = this._resolveQueryContactShape(hitData[0][0], hitData[1][0]);
      if (!shape || !shape._isSceneQuery) continue;
      if (!seen.has(shape._id)) {
        seen.add(shape._id);
        out.push(shape._id);
      }
    }
    return out;
  }

  private _resolveQueryContactShape(bodyHandle: bigint, shapeHandle: bigint): HavokShapeIdentity | null {
    const direct = this._havokPhysics._getShapeByHandle(shapeHandle);
    if (direct) return direct;
    const collider = this._bodyToCollider.get(bodyHandle);
    if (collider && collider._shapes.length > 0) {
      return collider._shapes[0];
    }
    const ctrl = this._bodyToController.get(bodyHandle);
    if (ctrl) return ctrl;
    return null;
  }

  private _resolveCollisionShape(bodyHandle: bigint, shapePath: [bigint, bigint]): HavokShapeIdentity | null {
    const collider = this._bodyToCollider.get(bodyHandle);
    if (collider) {
      if (collider._shapes.length === 0) return null;
      if (!collider._containerShape) {
        return collider._shapes[0];
      }
      const hk = this._havokPhysics._hk;
      const [res, , childIdx] = hk.HP_Shape_PathIterator_GetNext(shapePath);
      if (res.value === hk.Result.RESULT_OK.value && childIdx >= 0 && childIdx < collider._shapes.length) {
        return collider._shapes[childIdx];
      }
      return collider._shapes[0];
    }
    return this._bodyToController.get(bodyHandle) ?? null;
  }

  private _collectCollisionEvents(): void {
    const hk = this._havokPhysics._hk;
    const stepMap = this._stepContactMap;
    stepMap.clear();

    let evAddr = hk.HP_World_GetCollisionEvents(this._hkWorld)[1];
    while (evAddr !== 0) {
      const [res, ev] = hk.HP_Event_AsCollision(evAddr);
      if (res.value === hk.Result.RESULT_OK.value) {
        const evType = ev[0].value;
        const cpA = ev[1];
        const cpB = ev[2];
        const impulseScalar = ev[3];

        const shapeA = this._resolveCollisionShape(cpA[0][0], cpA[2]);
        const shapeB = this._resolveCollisionShape(cpB[0][0], cpB[2]);

        if (shapeA && shapeB && !shapeA._isTrigger && !shapeB._isTrigger && shapeA._id !== shapeB._id) {
          let s0: HavokShapeIdentity;
          let s1: HavokShapeIdentity;
          let c0 = cpA;
          let c1 = cpB;
          if (shapeA._id < shapeB._id) {
            s0 = shapeA;
            s1 = shapeB;
          } else {
            s0 = shapeB;
            s1 = shapeA;
            c0 = cpB;
            c1 = cpA;
          }

          const key = `${s0._id}_${s1._id}`;
          let bucket = stepMap.get(key);
          if (!bucket) {
            bucket = {
              shape0Id: s0._id,
              shape1Id: s1._id,
              hasFinished: false,
              isKinematicNonDynamic: false,
              points: []
            };
            stepMap.set(key, bucket);
          }

          if (evType === HavokEventBits.COLLISION_FINISHED) {
            bucket.hasFinished = true;
          } else {
            const p0 = c0[3];
            const p1 = c1[3];
            const n0 = c0[4];
            const n1 = c1[4];
            const nx = n1[0];
            const ny = n1[1];
            const nz = n1[2];
            const sep = (p1[0] - p0[0]) * n0[0] + (p1[1] - p0[1]) * n0[1] + (p1[2] - p0[2]) * n0[2];
            bucket.points.push({
              px: p0[0],
              py: p0[1],
              pz: p0[2],
              nx,
              ny,
              nz,
              ix: nx * impulseScalar,
              iy: ny * impulseScalar,
              iz: nz * impulseScalar,
              sep
            });
          }
        }
      }
      evAddr = hk.HP_World_GetNextCollisionEvent(this._hkWorld, evAddr);
    }

    // Havok natively omits collision events for Kinematic vs Static and Kinematic vs Kinematic;
    // match PhysX's moved-kinematic contact reporting via ShapeProximity on kinematic bodies that moved or hold active pairs.
    this._collectKinematicNonDynamicContacts(stepMap);

    stepMap.forEach((bucket, key) => {
      const existing = this._activeContactPairs.get(key);
      const wasActive = existing !== undefined;
      if (bucket.points.length > 0) {
        const state = wasActive ? PhysicsEventState.Stay : PhysicsEventState.Enter;
        if (!wasActive) {
          this._activeContactPairs.set(key, {
            shape0Id: bucket.shape0Id,
            shape1Id: bucket.shape1Id,
            isKinematicNonDynamic: bucket.isKinematicNonDynamic
          });
          if (bucket.isKinematicNonDynamic) {
            this._activeKinematicContactCount++;
          }
        } else if (existing.isKinematicNonDynamic !== bucket.isKinematicNonDynamic) {
          existing.isKinematicNonDynamic = bucket.isKinematicNonDynamic;
          this._activeKinematicContactCount += bucket.isKinematicNonDynamic ? 1 : -1;
        }
        this._pushContactEvent(bucket, state);
      } else if (bucket.hasFinished && wasActive) {
        if (existing.isKinematicNonDynamic) {
          this._activeKinematicContactCount--;
        }
        this._activeContactPairs.delete(key);
        this._pushContactEvent(bucket, PhysicsEventState.Exit);
      }
    });

    // End active kinematic-vs-static/kinematic pairs no longer overlapping this step,
    // and active pairs whose filter/body changed in place without re-detecting contact this step.
    if (this._activeKinematicContactCount > 0 || this._filterChangedShapeIds.size > 0) {
      const endedKeys: string[] = [];
      this._activeContactPairs.forEach((pair, key) => {
        if (stepMap.has(key)) return;
        const filterEnded =
          this._filterChangedShapeIds.size > 0 &&
          (this._filterChangedShapeIds.has(pair.shape0Id) || this._filterChangedShapeIds.has(pair.shape1Id));
        if (pair.isKinematicNonDynamic || filterEnded) {
          endedKeys.push(key);
          this._pushContactEvent(
            {
              shape0Id: pair.shape0Id,
              shape1Id: pair.shape1Id,
              hasFinished: true,
              isKinematicNonDynamic: pair.isKinematicNonDynamic,
              points: []
            },
            PhysicsEventState.Exit
          );
        }
      });
      for (let i = 0; i < endedKeys.length; i++) {
        const key = endedKeys[i];
        const pair = this._activeContactPairs.get(key);
        if (pair?.isKinematicNonDynamic) {
          this._activeKinematicContactCount--;
        }
        this._activeContactPairs.delete(key);
      }
    }
  }

  private _collectKinematicNonDynamicContacts(stepMap: Map<string, StepContactBucket>): void {
    const activeKinShapeIds = this._activeKinematicShapeIds;
    activeKinShapeIds.clear();
    if (this._activeKinematicContactCount > 0) {
      this._activeContactPairs.forEach((pair) => {
        if (pair.isKinematicNonDynamic) {
          activeKinShapeIds.add(pair.shape0Id);
          activeKinShapeIds.add(pair.shape1Id);
        }
      });
    }

    const hk = this._havokPhysics._hk;
    const bodyPos = HavokPhysicsScene._tempPosition;
    const bodyRot = HavokPhysicsScene._tempQuat;
    const shapePos = HavokPhysicsScene._tempPosB;
    const shapeRot = HavokPhysicsScene._tempQuatB;

    this._dynamicColliders.forEach((col) => {
      if (!col._isKinematicBody()) return;
      const shapes = col._shapes;
      if (shapes.length === 0) return;

      let shouldProbe = col._didMoveKinematicThisStep();
      if (!shouldProbe && activeKinShapeIds.size > 0) {
        for (let i = 0, n = shapes.length; i < n; i++) {
          if (activeKinShapeIds.has(shapes[i]._id)) {
            shouldProbe = true;
            break;
          }
        }
      }
      if (!shouldProbe) return;

      col.getWorldTransform(bodyPos, bodyRot);
      for (let i = 0, n = shapes.length; i < n; i++) {
        const s = shapes[i];
        if (!s._hkShape || s._isTrigger) continue;

        Vector3.transformByQuat(s._localPosition, bodyRot, shapePos);
        shapePos.add(bodyPos);
        Quaternion.multiply(bodyRot, s._localRotation, shapeRot);
        shapeRot.normalize();

        const pos: HKVector3 = [shapePos.x, shapePos.y, shapePos.z];
        const rot: [number, number, number, number] = [shapeRot.x, shapeRot.y, shapeRot.z, shapeRot.w];

        let numHits: number;
        while (true) {
          hk.HP_World_ShapeProximityWithCollector(this._hkWorld, this._multiCollector, [
            s._hkShape,
            pos,
            rot,
            0,
            false,
            col._hkBody
          ]);
          numHits = hk.HP_QueryCollector_GetNumHits(this._multiCollector)[1];
          if (numHits < this._collectorCapacity || this._collectorCapacity >= 16384) {
            break;
          }
          this._growCollector();
        }

        for (let h = 0; h < numHits; h++) {
          const [dist, , hitData] = hk.HP_QueryCollector_GetShapeProximityResult(this._multiCollector, h)[1];
          if (dist > 0) continue;
          const hitBody = hitData[0][0];
          const otherCollider = this._bodyToCollider.get(hitBody);
          if (!otherCollider) continue;
          // Dynamic targets already emit native Havok collision events
          if (otherCollider instanceof HavokDynamicCollider && !otherCollider._isKinematicBody()) continue;

          const otherShape = this._resolveQueryContactShape(hitBody, hitData[1][0]);
          if (!otherShape || otherShape._isTrigger || otherShape._id === s._id) continue;

          const queryIsShape0 = s._id < otherShape._id;
          const id0 = queryIsShape0 ? s._id : otherShape._id;
          const id1 = queryIsShape0 ? otherShape._id : s._id;
          const key = `${id0}_${id1}`;

          let bucket = stepMap.get(key);
          if (bucket && bucket.points.length > 0) continue;
          if (!bucket) {
            bucket = {
              shape0Id: id0,
              shape1Id: id1,
              hasFinished: false,
              isKinematicNonDynamic: true,
              points: []
            };
            stepMap.set(key, bucket);
          }

          // hitData[4] points outward from hitShape toward queryShape; ContactPoint.normal points from shape1 -> shape0
          const p = hitData[3];
          const n = hitData[4];
          const sign = queryIsShape0 ? 1 : -1;
          bucket.points.push({
            px: p[0],
            py: p[1],
            pz: p[2],
            nx: n[0] * sign,
            ny: n[1] * sign,
            nz: n[2] * sign,
            ix: 0,
            iy: 0,
            iz: 0,
            sep: dist
          });
        }
      }
    });
  }

  private _pushContactEvent(bucket: StepContactBucket, state: PhysicsEventState): void {
    const idx = this._contactEventCount++;
    const event = (this._contactEvents[idx] ||= new ContactEvent());
    event.shape0Id = bucket.shape0Id;
    event.shape1Id = bucket.shape1Id;
    event.state = state;

    const buffered = event._bufferedContacts;
    const pts = bucket.points;
    const count = (buffered.contactCount = pts.length);
    for (let i = 0; i < count; i++) {
      const src = pts[i];
      const dst = (buffered.contacts[i] ||= new BufferedContactPoint());
      dst.position.set(src.px, src.py, src.pz);
      dst.normal.set(src.nx, src.ny, src.nz);
      dst.impulse.set(src.ix, src.iy, src.iz);
      dst.separation = src.sep;
    }
  }

  private _collectTriggerEvents(): void {
    const hk = this._havokPhysics._hk;
    let evAddr = hk.HP_World_GetTriggerEvents(this._hkWorld)[1];

    while (evAddr !== 0) {
      const heapU32 = hk.HEAPU32;
      const base = evAddr >>> 2;
      const evType = heapU32[base];
      const bodyA = BigInt(heapU32[base + 2]);
      const shapeHandleA = BigInt(heapU32[base + 4]);
      const bodyB = BigInt(heapU32[base + 6]);
      const shapeHandleB = BigInt(heapU32[base + 8]);

      const shapeA = this._resolveQueryContactShape(bodyA, shapeHandleA);
      const shapeB = this._resolveQueryContactShape(bodyB, shapeHandleB);

      if (shapeA && shapeB && shapeA._id !== shapeB._id) {
        // Match Galacean/PhysX spec: Trigger-vs-Trigger does NOT fire trigger callbacks
        if (!(shapeA._isTrigger && shapeB._isTrigger)) {
          const id1 = shapeA._id < shapeB._id ? shapeA._id : shapeB._id;
          const id2 = shapeA._id < shapeB._id ? shapeB._id : shapeA._id;
          const key = `${id1}_${id2}`;

          if (evType === HavokEventBits.TRIGGER_ENTERED) {
            const prevCount = this._triggerOverlapCounts.get(key) ?? 0;
            this._triggerOverlapCounts.set(key, prevCount + 1);
            const existing = this._triggerPairMap.get(key);
            if (existing) {
              // Trigger continuity: only restore Exit -> Stay on re-detection after reparent/re-insert/filter change;
              // keep Enter as Enter when multiple triangles of the same mesh fire TRIGGER_ENTERED in one step.
              if (existing.state === PhysicsEventState.Exit) {
                existing.state = PhysicsEventState.Stay;
              }
            } else {
              const ev = this._acquireTriggerEvent(id1, id2);
              ev.state = PhysicsEventState.Enter;
              this._triggerPairMap.set(key, ev);
              this._activeTriggers.add(ev);
            }
          } else if (evType === HavokEventBits.TRIGGER_EXITED) {
            const prevCount = this._triggerOverlapCounts.get(key) ?? 0;
            if (prevCount <= 1) {
              this._triggerOverlapCounts.delete(key);
              const ev = this._triggerPairMap.get(key);
              if (ev) {
                ev.state = PhysicsEventState.Exit;
              }
            } else {
              this._triggerOverlapCounts.set(key, prevCount - 1);
            }
          }
        }
      }

      evAddr = hk.HP_World_GetNextTriggerEvent(this._hkWorld, evAddr);
    }
  }

  private _acquireTriggerEvent(index1: number, index2: number): TriggerEvent {
    const pool = this._triggerEventPool;
    if (pool.length > 0) {
      const ev = pool.pop()!;
      ev.index1 = index1;
      ev.index2 = index2;
      return ev;
    }
    return new TriggerEvent(index1, index2);
  }
}

interface CachedQueryShape {
  shape: HP_ShapeId;
  filterMask: number;
}

interface StepContactPoint {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  ix: number;
  iy: number;
  iz: number;
  sep: number;
}

interface StepContactBucket {
  shape0Id: number;
  shape1Id: number;
  hasFinished: boolean;
  isKinematicNonDynamic: boolean;
  points: StepContactPoint[];
}

class TriggerEvent implements ITriggerEvent {
  state: number = 0;
  dispatchState: number = 0;
  index1: number;
  index2: number;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}

class BufferedContactPoint {
  position = new Vector3();
  normal = new Vector3();
  impulse = new Vector3();
  separation = 0;
}

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
  state: number = 0;
  shape0Id: number = 0;
  shape1Id: number = 0;

  /** @internal */
  _bufferedContacts = new BufferedContacts();

  get contactCount(): number {
    return this._bufferedContacts.contactCount;
  }

  getContacts(): BufferedContacts {
    return this._bufferedContacts;
  }
}
