import { Quaternion, Vector3 } from "@galacean/engine";
import { IContactEvent, IPhysicsEvents, IPhysicsScene, ITriggerEvent } from "@galacean/engine-design";
import { HavokCharacterController } from "./HavokCharacterController";
import { HavokCollider } from "./HavokCollider";
import { HavokDynamicCollider } from "./HavokDynamicCollider";
import { HavokPhysics } from "./HavokPhysics";
import {
  COL_DIRTY_BROADPHASE,
  COL_DIRTY_FILTER,
  COL_DIRTY_SHAPE,
  COL_IN_BROADPHASE_QUEUE,
  COL_IN_STEP_QUEUE,
  CTRL_DIRTY_BROADPHASE,
  CTRL_DIRTY_FILTER,
  DYN_IN_CLAMPED_ANG_VEL,
  DYN_IN_KIN_RESET,
  DYN_IN_PENDING_FORCE,
  DYN_IN_PENDING_KIN_MOVE,
  DYN_PROBED_THIS_STEP,
  HavokShapeIdentity,
  HK_EVENT_COLLISION_FINISHED,
  HK_EVENT_TRIGGER_ENTERED,
  HK_EVENT_TRIGGER_EXITED,
  HKContactPoint,
  HKFilterInfo,
  HKQuaternion,
  HKVector3,
  HP_BodyId,
  HP_CollectorId,
  HP_ShapeId,
  HP_WorldId,
  IDENTITY_QUAT,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
  swapRemove,
  writeNormalizedQuat,
  writeVec3,
  ZERO_HANDLE,
  ZERO_VEC3
} from "./HavokTypes";
import { HavokJoint } from "./joint/HavokJoint";

// Power-of-two upper bound avoids float32 rounding error when reconstructing hit distance from fraction * clampedDist.
const MAX_QUERY_DISTANCE = 131072;
const MIN_QUERY_DIM = 1e-4;
const MAX_QUERY_SHAPE_CACHE = 64;
const MAX_COLLECTOR_CAPACITY = 16384;
// 2^26 stride packs two sequential Collider IDs (< 67M) into a 52-bit exact IEEE-754 safe integer key.
const PAIR_KEY_STRIDE = 0x4000000;
// Matches Galacean Rigidbody default `maxAngularVelocity = 18000 / Math.PI` deg/s = 100 rad/s.
const DEFAULT_MAX_ANG_VEL = 100;
const ANG_VEL_EPS = 1e-4;
const UNLIMITED_SPEED = 1e6;

enum PhysicsEventState {
  Enter = 0,
  Stay = 1,
  Exit = 2
}

const enum QueryKind {
  Ray = 0,
  ShapeCast = 1,
  ShapeProximity = 2
}

/**
 * Simulates colliders and executes scene queries through Havok WASM.
 */
export class HavokPhysicsScene implements IPhysicsScene {
  private static _tempVecA = new Vector3();
  private static _tempVecB = new Vector3();
  private static _tempQuatA = new Quaternion();
  private static _tempQuatB = new Quaternion();

  private static _tempQueryRot: HKQuaternion = [0, 0, 0, 1];
  private static _tempFilter: HKFilterInfo = [0xffffffff, 0xffffffff];
  private static _tempRayInput: [HKVector3, HKVector3, HKFilterInfo, boolean, HP_BodyId] = [
    [0, 0, 0],
    [0, 0, 0],
    [0xffffffff, 0xffffffff],
    true,
    ZERO_HANDLE
  ];
  private static _tempShapeCastInput: [HP_ShapeId, HKQuaternion, HKVector3, HKVector3, boolean, HP_BodyId] = [
    ZERO_HANDLE,
    [0, 0, 0, 1],
    [0, 0, 0],
    [0, 0, 0],
    true,
    ZERO_HANDLE
  ];
  private static _tempShapeProxInput: [HP_ShapeId, HKVector3, HKQuaternion, number, boolean, HP_BodyId] = [
    ZERO_HANDLE,
    [0, 0, 0],
    [0, 0, 0, 1],
    0,
    true,
    ZERO_HANDLE
  ];
  private static _tempHit: QueryHitScratch = {
    frac: 0,
    bodyPtr: 0,
    shapePtr: 0,
    px: 0,
    py: 0,
    pz: 0,
    nx: 0,
    ny: 0,
    nz: 0
  };

  /** @internal */
  _hkWorld: HP_WorldId;
  /** @internal */
  _worldAnchorBody: HP_BodyId;
  /** @internal */
  _worldAnchorBodyPtr: number;
  /** @internal */
  _contactEventsEnabled = false;
  /** @internal */
  _bodyToController = new Map<number, HavokCharacterController>();
  /** @internal */
  _removedShapeIds = new Set<number>();

  private _havokPhysics: HavokPhysics;
  private _destroyed = false;
  private _colliders = new Set<HavokCollider>();
  private _controllers = new Set<HavokCharacterController>();
  private _joints: HavokJoint[] = [];
  private _bodyToCollider = new Map<number, HavokCollider>();

  // Dense per-step active queues (zero SetIterator allocations during update())
  private _pendingForceList: HavokDynamicCollider[] = [];
  private _pendingKinematicMoveList: HavokDynamicCollider[] = [];
  private _kinematicResetList: HavokDynamicCollider[] = [];
  private _clampedAngVelList: HavokDynamicCollider[] = [];
  private _kinProbeQueue: HavokDynamicCollider[] = [];
  private _highAngVelCount = 0;
  private _worldMaxAngVel = DEFAULT_MAX_ANG_VEL;
  private _appliedWorldMaxAngVel = DEFAULT_MAX_ANG_VEL;
  private _lastStepTime = -1;

  // Dense deferred shape/filter/broadphase flush queues (backed by `_dirtyFlags` bitmasks)
  private _stepDirtyColliders: HavokCollider[] = [];
  private _broadphaseDirtyColliders: HavokCollider[] = [];
  private _broadphaseDirtyControllers: HavokCharacterController[] = [];
  private _filterDirtyControllers: HavokCharacterController[] = [];
  private _filterChangedShapeIds = new Set<number>();

  // Query collectors & persistent 256B Tier 2 raw C-ABI scratch buffer (0 when Tier 2 unavailable)
  private _singleCollector: HP_CollectorId;
  private _multiCollector: HP_CollectorId;
  private _collectorCapacity = 256;
  private _queryScratchPtr = 0;

  // Zero-alloc collision & trigger tracking using 52-bit integer pair keys
  private _activeContactPairs = new Set<number>();
  private _activeKinematicPairs = new Map<number, HavokDynamicCollider>();
  private _stepContactMap = new Map<number, ContactEvent>();
  private _stepFinishedKeys: number[] = [];
  private _contactEvents: ContactEvent[] = [];
  private _contactEventCount = 0;

  private _triggerPairMap = new Map<number, TriggerEvent>();
  private _activeTriggers: TriggerEvent[] = [];
  private _triggerEvents: TriggerEvent[] = [];
  private _triggerEventPool: TriggerEvent[] = [];

  private _physicsEvents: IPhysicsEvents = {
    contactEvents: this._contactEvents,
    contactEventCount: 0,
    triggerEvents: this._triggerEvents
  };
  private _overlapResultBuffer: number[] = [];
  private _overlapSeen = new Set<number>();

  // Pooled raycastAll dedup state with reentrancy guard
  private _raycastAllIndexMap = new Map<number, number>();
  private _raycastAllRecords: RaycastHitRecord[] = [];
  private _inRaycastAll = false;

  // Bounded query-shape caches (capped at MAX_QUERY_SHAPE_CACHE per geometry kind)
  private _sphereQueryCache = new Map<number, CachedQueryShape>();
  private _boxQueryCache = new Map<string, CachedQueryShape>();
  private _capsuleQueryCache = new Map<string, CachedQueryShape>();
  private _lastSphereR = -1;
  private _lastSphereEntry: CachedQueryShape | null = null;
  private _lastBoxX = -1;
  private _lastBoxY = -1;
  private _lastBoxZ = -1;
  private _lastBoxEntry: CachedQueryShape | null = null;
  private _lastCapR = -1;
  private _lastCapHalfH = -1;
  private _lastCapEntry: CachedQueryShape | null = null;

  constructor(havokPhysics: HavokPhysics) {
    this._havokPhysics = havokPhysics;
    const hk = havokPhysics._hk;

    this._hkWorld = hk.HP_World_Create()[1];
    hk.HP_World_SetGravity(this._hkWorld, [0, -9.81, 0]);
    hk.HP_World_SetSpeedLimit(this._hkWorld, UNLIMITED_SPEED, DEFAULT_MAX_ANG_VEL);

    // Hidden world anchor static body for null-connected joints and DOF-lock constraints
    // (`HP_Body_Create` defaults to STATIC at origin with identity rotation).
    this._worldAnchorBody = hk.HP_Body_Create()[1];
    this._worldAnchorBodyPtr = Number(this._worldAnchorBody[0]);
    hk.HP_World_AddBody(this._hkWorld, this._worldAnchorBody, false);

    this._singleCollector = hk.HP_QueryCollector_Create(1)[1];
    this._multiCollector = hk.HP_QueryCollector_Create(this._collectorCapacity)[1];
    this._queryScratchPtr = havokPhysics._useRawABI ? hk._malloc(256) : 0;

    havokPhysics._registerScene(this);
  }

  /** @internal */
  _addJoint(joint: HavokJoint): void {
    if (this._joints.indexOf(joint) === -1) {
      this._joints.push(joint);
    }
  }

  /** @internal */
  _removeJoint(joint: HavokJoint): void {
    swapRemove(this._joints, joint);
  }

  /** @internal */
  _queueStepDirtyCollider(collider: HavokCollider, flag: number): void {
    collider._dirtyFlags |= flag;
    if ((collider._dirtyFlags & COL_IN_STEP_QUEUE) === 0) {
      collider._dirtyFlags |= COL_IN_STEP_QUEUE;
      this._stepDirtyColliders.push(collider);
    }
  }

  /** @internal */
  _queueBroadphaseDirtyCollider(collider: HavokCollider): void {
    collider._dirtyFlags |= COL_DIRTY_BROADPHASE;
    if ((collider._dirtyFlags & COL_IN_BROADPHASE_QUEUE) === 0) {
      collider._dirtyFlags |= COL_IN_BROADPHASE_QUEUE;
      this._broadphaseDirtyColliders.push(collider);
    }
  }

  /** @internal */
  _queueBroadphaseDirtyController(ctrl: HavokCharacterController): void {
    if ((ctrl._dirtyFlags & CTRL_DIRTY_BROADPHASE) === 0) {
      ctrl._dirtyFlags |= CTRL_DIRTY_BROADPHASE;
      this._broadphaseDirtyControllers.push(ctrl);
    }
  }

  /** @internal */
  _clearControllerDirty(ctrl: HavokCharacterController): void {
    if ((ctrl._dirtyFlags & CTRL_DIRTY_BROADPHASE) !== 0) {
      swapRemove(this._broadphaseDirtyControllers, ctrl);
    }
    if ((ctrl._dirtyFlags & CTRL_DIRTY_FILTER) !== 0) {
      swapRemove(this._filterDirtyControllers, ctrl);
    }
    ctrl._dirtyFlags = 0;
  }

  /** @internal */
  _queuePendingForce(collider: HavokDynamicCollider): void {
    if ((collider._sceneFlags & DYN_IN_PENDING_FORCE) === 0) {
      collider._sceneFlags |= DYN_IN_PENDING_FORCE;
      this._pendingForceList.push(collider);
    }
  }

  /** @internal */
  _queuePendingKinematicMove(collider: HavokDynamicCollider): void {
    if ((collider._sceneFlags & DYN_IN_PENDING_KIN_MOVE) === 0) {
      collider._sceneFlags |= DYN_IN_PENDING_KIN_MOVE;
      this._pendingKinematicMoveList.push(collider);
    }
  }

  /** @internal */
  _cancelPendingKinematicMove(collider: HavokDynamicCollider): void {
    if ((collider._sceneFlags & DYN_IN_PENDING_KIN_MOVE) !== 0) {
      collider._sceneFlags &= ~DYN_IN_PENDING_KIN_MOVE;
      swapRemove(this._pendingKinematicMoveList, collider);
    }
  }

  /** @internal */
  _onDynamicMotionStateChanged(collider: HavokDynamicCollider, isKinematic: boolean): void {
    const hk = this._havokPhysics._hk;
    if (isKinematic) {
      if ((collider._sceneFlags & DYN_IN_PENDING_FORCE) !== 0) {
        collider._sceneFlags &= ~DYN_IN_PENDING_FORCE;
        swapRemove(this._pendingForceList, collider);
      }
      this._unregisterDynamicSpeedLimit(collider, collider._maxAngularVelocityRad);
      hk.HP_Body_SetMotionType(collider._hkBody, hk.MotionType.KINEMATIC);
    } else {
      this._cancelPendingKinematicMove(collider);
      if ((collider._sceneFlags & DYN_IN_KIN_RESET) !== 0) {
        collider._sceneFlags &= ~DYN_IN_KIN_RESET;
        swapRemove(this._kinematicResetList, collider);
      }
      if (collider._maxAngularVelocityRad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS) {
        this._ensureUnlimitedWorldSpeed();
      }
      hk.HP_Body_SetMotionType(collider._hkBody, hk.MotionType.DYNAMIC);
      this._registerDynamicSpeedLimit(collider);
    }
  }

  /** @internal */
  _onDynamicMaxAngularVelocityChanged(collider: HavokDynamicCollider, prevRad: number, nextRad: number): void {
    const wasHigh = prevRad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS;
    const isHigh = nextRad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS;

    if (wasHigh !== isHigh) {
      this._unregisterDynamicSpeedLimit(collider, prevRad);
      if (isHigh) {
        this._ensureUnlimitedWorldSpeed();
        // Re-allocate this body's Havok motion properties so it picks up the raised 1e6 angular limit.
        collider._refreshDynamicMotionProperties();
      }
      this._registerDynamicSpeedLimit(collider);
    } else {
      const shouldClamp = isHigh
        ? nextRad < 1e5
        : Math.abs(nextRad - DEFAULT_MAX_ANG_VEL) > ANG_VEL_EPS || this._worldMaxAngVel > DEFAULT_MAX_ANG_VEL;
      if (shouldClamp) {
        this._addClampedAngVel(collider);
      } else {
        this._removeClampedAngVel(collider);
      }
    }
  }

  /** @internal */
  _reinsertBody(collider: HavokCollider, rebuildShape: boolean): void {
    if ((collider._dirtyFlags & COL_IN_STEP_QUEUE) !== 0) {
      swapRemove(this._stepDirtyColliders, collider);
    }
    if ((collider._dirtyFlags & COL_IN_BROADPHASE_QUEUE) !== 0) {
      swapRemove(this._broadphaseDirtyColliders, collider);
    }
    collider._dirtyFlags = 0;

    if (!this._colliders.has(collider)) {
      if (rebuildShape) {
        collider._rebuildBodyShape();
      }
      return;
    }

    const hk = this._havokPhysics._hk;
    const isDynamic = collider._isDynamic && !(collider as HavokDynamicCollider)._isKinematic;
    const savedAngVel =
      isDynamic && (collider as HavokDynamicCollider)._maxAngularVelocityRad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS
        ? hk.HP_Body_GetAngularVelocity(collider._hkBody)[1]
        : undefined;

    hk.HP_World_RemoveBody(this._hkWorld, collider._hkBody);
    if (rebuildShape) {
      collider._rebuildBodyShape();
    }
    // Always re-add awake (`startAsleep = false`) so Havok re-evaluates support/overlap pairs after
    // shape, filter, or broadphase changes (preventing suspended sleeping bodies and spurious Exit events).
    hk.HP_World_AddBody(this._hkWorld, collider._hkBody, false);
    if (savedAngVel && (savedAngVel[0] !== 0 || savedAngVel[1] !== 0 || savedAngVel[2] !== 0)) {
      hk.HP_Body_SetAngularVelocity(collider._hkBody, savedAngVel);
    }

    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      const id = shapes[i]._id;
      this._markShapeTriggersPendingExit(id);
      this._filterChangedShapeIds.add(id);
    }
  }

  /** @internal */
  _flushDirtyColliders(excludeController?: HavokCharacterController, clearBroadphaseOnly = false): void {
    const stepList = this._stepDirtyColliders;
    while (stepList.length > 0) {
      const col = stepList.pop()!;
      const flags = col._dirtyFlags;
      col._dirtyFlags &= ~(COL_DIRTY_SHAPE | COL_DIRTY_FILTER | COL_IN_STEP_QUEUE);
      if ((flags & (COL_DIRTY_SHAPE | COL_DIRTY_FILTER)) !== 0) {
        this._reinsertBody(col, (flags & COL_DIRTY_SHAPE) !== 0);
      }
    }

    const bpList = this._broadphaseDirtyColliders;
    if (bpList.length > 0) {
      if (clearBroadphaseOnly) {
        for (let i = 0, n = bpList.length; i < n; i++) {
          bpList[i]._dirtyFlags &= ~(COL_DIRTY_BROADPHASE | COL_IN_BROADPHASE_QUEUE);
        }
        bpList.length = 0;
      } else {
        while (bpList.length > 0) {
          const col = bpList.pop()!;
          const flags = col._dirtyFlags;
          col._dirtyFlags &= ~(COL_DIRTY_BROADPHASE | COL_IN_BROADPHASE_QUEUE);
          if ((flags & COL_DIRTY_BROADPHASE) !== 0) {
            this._reinsertBody(col, false);
          }
        }
      }
    }

    const ctrlBpList = this._broadphaseDirtyControllers;
    if (ctrlBpList.length > 0) {
      if (clearBroadphaseOnly) {
        for (let i = 0, n = ctrlBpList.length; i < n; i++) {
          ctrlBpList[i]._dirtyFlags &= ~CTRL_DIRTY_BROADPHASE;
        }
        ctrlBpList.length = 0;
      } else {
        for (let i = ctrlBpList.length - 1; i >= 0; i--) {
          const ctrl = ctrlBpList[i];
          if (ctrl === excludeController) continue;
          const last = ctrlBpList.length - 1;
          if (i !== last) ctrlBpList[i] = ctrlBpList[last];
          ctrlBpList.length = last;
          ctrl._dirtyFlags &= ~CTRL_DIRTY_BROADPHASE;
          if ((ctrl._dirtyFlags & CTRL_DIRTY_FILTER) !== 0) {
            ctrl._dirtyFlags &= ~CTRL_DIRTY_FILTER;
            swapRemove(this._filterDirtyControllers, ctrl);
          }
          if (this._reinsertController(ctrl)) {
            this._markShapeTriggersPendingExit(ctrl._id);
            this._filterChangedShapeIds.add(ctrl._id);
          }
        }
      }
    }

    const ctrlFilterList = this._filterDirtyControllers;
    if (ctrlFilterList.length > 0) {
      for (let i = ctrlFilterList.length - 1; i >= 0; i--) {
        const ctrl = ctrlFilterList[i];
        if (ctrl === excludeController) continue;
        const last = ctrlFilterList.length - 1;
        if (i !== last) ctrlFilterList[i] = ctrlFilterList[last];
        ctrlFilterList.length = last;
        ctrl._dirtyFlags &= ~CTRL_DIRTY_FILTER;
        this._reinsertController(ctrl);
      }
    }
  }

  /** @internal */
  _invalidateShapePairs(collider: HavokCollider, shapeId: number): void {
    this._markShapeTriggersPendingExit(shapeId);
    this._filterChangedShapeIds.add(shapeId);
    this._queueStepDirtyCollider(collider, COL_DIRTY_FILTER);
  }

  /** @internal */
  _onControllerFilterChanged(controller: HavokCharacterController): void {
    this._markShapeTriggersPendingExit(controller._id);
    this._filterChangedShapeIds.add(controller._id);
    if ((controller._dirtyFlags & CTRL_DIRTY_FILTER) === 0) {
      controller._dirtyFlags |= CTRL_DIRTY_FILTER;
      this._filterDirtyControllers.push(controller);
    }
  }

  /** @internal */
  _onLayerMatrixChanged(changedLayersMask: number): void {
    for (let it = this._colliders.values(), cur = it.next(); !cur.done; cur = it.next()) {
      const collider = cur.value;
      const shapes = collider._shapes;
      let affected = false;
      for (let i = 0, n = shapes.length; i < n; i++) {
        const s = shapes[i];
        if (((changedLayersMask >>> (s._layer & 31)) & 1) !== 0) {
          s._syncLayerFilter();
          this._markShapeTriggersPendingExit(s._id);
          this._filterChangedShapeIds.add(s._id);
          affected = true;
        }
      }
      if (affected) {
        this._queueStepDirtyCollider(collider, COL_DIRTY_FILTER);
      }
    }
    for (let it = this._controllers.values(), cur = it.next(); !cur.done; cur = it.next()) {
      const ctrl = cur.value;
      if (((changedLayersMask >>> (ctrl._collisionLayer & 31)) & 1) !== 0) {
        ctrl._syncLayerFilter();
        this._onControllerFilterChanged(ctrl);
      }
    }
  }

  /** @internal */
  _removeColliderShape(id: number): void {
    // Mark active triggers as Exit; if re-added before next step, Havok re-detecting them restores Stay.
    // Otherwise _releaseRemovedShapes() drops them silently.
    this._markShapeTriggersPendingExit(id);
    this._removedShapeIds.add(id);

    // Collision pairs restart with onCollisionEnter when a collider moves actors
    if (this._activeContactPairs.size > 0) {
      for (let it = this._activeContactPairs.values(), cur = it.next(); !cur.done; cur = it.next()) {
        const key = cur.value;
        const id1 = key % PAIR_KEY_STRIDE;
        const id0 = (key - id1) / PAIR_KEY_STRIDE;
        if (id0 === id || id1 === id) {
          this._activeKinematicPairs.delete(key);
          this._activeContactPairs.delete(key);
        }
      }
    }
  }

  setGravity(gravity: Vector3): void {
    this._havokPhysics._hk.HP_World_SetGravity(this._hkWorld, writeVec3(gravity, SCRATCH_VEC3_A));
  }

  addCollider(collider: HavokCollider): void {
    const prevSize = this._colliders.size;
    this._colliders.add(collider);
    if (this._colliders.size === prevSize) return;

    this._bodyToCollider.set(collider._hkBodyPtr, collider);
    const filterVer = this._havokPhysics._filterVersion;
    const shapes = collider._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      const s = shapes[i];
      if (s._syncedFilterVersion !== filterVer) {
        s._syncLayerFilter();
      }
    }
    collider._flushShapeIfDirty();

    const hk = this._havokPhysics._hk;
    if (collider._isDynamic) {
      const dyn = collider as HavokDynamicCollider;
      if (dyn._isKinematic) {
        hk.HP_World_AddBody(this._hkWorld, collider._hkBody, false);
        if (dyn._hasPendingKinematicTarget) {
          this._queuePendingKinematicMove(dyn);
        }
      } else {
        const isHighAngVel = dyn._maxAngularVelocityRad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS;
        let savedAngVel: HKVector3 | undefined;
        if (isHighAngVel) {
          savedAngVel = hk.HP_Body_GetAngularVelocity(dyn._hkBody)[1];
          this._ensureUnlimitedWorldSpeed();
        }
        hk.HP_World_AddBody(this._hkWorld, collider._hkBody, false);
        // HP_World_AddBody allocates motion properties using the active 1e6 speed limit but clamps pre-existing
        // velocity to 100 during insertion; re-writing savedAngVel restores it without STATIC -> DYNAMIC rebuild.
        if (savedAngVel && (savedAngVel[0] !== 0 || savedAngVel[1] !== 0 || savedAngVel[2] !== 0)) {
          hk.HP_Body_SetAngularVelocity(dyn._hkBody, savedAngVel);
        }
        this._registerDynamicSpeedLimit(dyn);
        if ((dyn._sceneFlags & DYN_IN_CLAMPED_ANG_VEL) !== 0) {
          dyn._clampAngularVelocity();
        }
        if (dyn._hasPendingForces()) {
          this._queuePendingForce(dyn);
        }
      }
    } else {
      hk.HP_World_AddBody(this._hkWorld, collider._hkBody, false);
    }

    collider._onAddedToScene(this);

    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removedShapeIds.delete(shapes[i]._id);
    }
  }

  removeCollider(collider: HavokCollider): void {
    if (!this._colliders.delete(collider)) return;
    if ((collider._dirtyFlags & COL_IN_STEP_QUEUE) !== 0) {
      swapRemove(this._stepDirtyColliders, collider);
    }
    if ((collider._dirtyFlags & COL_IN_BROADPHASE_QUEUE) !== 0) {
      swapRemove(this._broadphaseDirtyColliders, collider);
    }
    collider._dirtyFlags &= COL_DIRTY_SHAPE;
    this._bodyToCollider.delete(collider._hkBodyPtr);
    if (collider._isDynamic) {
      const dyn = collider as HavokDynamicCollider;
      if ((dyn._sceneFlags & DYN_IN_PENDING_FORCE) !== 0) {
        swapRemove(this._pendingForceList, dyn);
      }
      if ((dyn._sceneFlags & DYN_IN_PENDING_KIN_MOVE) !== 0) {
        swapRemove(this._pendingKinematicMoveList, dyn);
      }
      if ((dyn._sceneFlags & DYN_IN_KIN_RESET) !== 0) {
        swapRemove(this._kinematicResetList, dyn);
      }
      if (!dyn._isKinematic) {
        this._unregisterDynamicSpeedLimit(dyn, dyn._maxAngularVelocityRad);
      }
      dyn._sceneFlags = 0;
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
    const prevSize = this._controllers.size;
    this._controllers.add(controller);
    if (this._controllers.size === prevSize) return;
    controller._addToScene(this);
  }

  removeCharacterController(controller: HavokCharacterController): void {
    if (!this._controllers.delete(controller)) return;
    this._clearControllerDirty(controller);
    controller._removeFromScene();
  }

  update(elapsedTime: number): void {
    this._contactEventCount = 0;

    // 1. Drop trigger pairs of shapes removed since last step and NOT re-added
    this._releaseRemovedShapes();

    // 2. Flush deferred container rebuilds & broadphase filter invalidations.
    //    Only skip broadphase re-insert when `elapsedTime > 0`, since `HP_World_Step(0)` does not refresh broadphase.
    this._flushDirtyColliders(undefined, elapsedTime > 0);

    // 3. Configure ideal step time BEFORE kinematic targets so HP_Body_SetTargetQTransform uses exact dt
    const hk = this._havokPhysics._hk;
    if (elapsedTime !== this._lastStepTime) {
      this._lastStepTime = elapsedTime;
      hk.HP_World_SetIdealStepTime(this._hkWorld, elapsedTime);
    }

    // 4. Flush pending kinematic targets & accumulated forces/torques (dense active queues, zero iterator alloc)
    const kinMoves = this._pendingKinematicMoveList;
    if (elapsedTime > 0 && kinMoves.length > 0) {
      for (let i = 0, n = kinMoves.length; i < n; i++) {
        const col = kinMoves[i];
        col._sceneFlags &= ~DYN_IN_PENDING_KIN_MOVE;
        if (col._applyKinematicMove(elapsedTime, this._hkWorld, this._worldMaxAngVel, this._appliedWorldMaxAngVel)) {
          if ((col._sceneFlags & DYN_IN_KIN_RESET) === 0) {
            col._sceneFlags |= DYN_IN_KIN_RESET;
            this._kinematicResetList.push(col);
          }
        }
      }
      kinMoves.length = 0;
    }
    const forceList = this._pendingForceList;
    if (forceList.length > 0) {
      for (let i = 0, n = forceList.length; i < n; i++) {
        const col = forceList[i];
        col._sceneFlags &= ~DYN_IN_PENDING_FORCE;
        col._flushForces(elapsedTime);
      }
      forceList.length = 0;
    }

    // 5. Joint pre-step hooks (e.g., HingeJoint freeSpin)
    const joints = this._joints;
    for (let i = 0, n = joints.length; i < n; i++) {
      joints[i]._preStep(elapsedTime);
    }

    // 6. Step Havok world (HP_World_Step with dt > 0 flushes any deferred HP_World_SetSpeedLimit to all bodies)
    hk.HP_World_Step(this._hkWorld, elapsedTime);
    if (elapsedTime > 0) {
      this._appliedWorldMaxAngVel = this._worldMaxAngVel;
    }

    // 7. Post-step custom dynamic angular-velocity clamps, breakable/projected joint checks
    //    (run BEFORE kinematic velocity resets so FixedJoint inherits moving kinematic anchor velocity),
    //    and kinematic velocity resets (Havok keeps kinematic target velocity unless cleared).
    const clampedList = this._clampedAngVelList;
    for (let i = 0, n = clampedList.length; i < n; i++) {
      clampedList[i]._clampAngularVelocity();
    }
    for (let i = 0, n = joints.length; i < n; i++) {
      joints[i]._checkBreak(elapsedTime);
    }
    const kinResetList = this._kinematicResetList;
    for (let i = 0, n = kinResetList.length; i < n; i++) {
      kinResetList[i]._zeroVelocities();
    }

    // 8. Harvest collision & trigger events immediately after step
    if (this._contactEventsEnabled) {
      this._collectCollisionEvents();
    }
    if (kinResetList.length > 0) {
      for (let i = 0, n = kinResetList.length; i < n; i++) {
        kinResetList[i]._sceneFlags &= ~DYN_IN_KIN_RESET;
      }
      kinResetList.length = 0;
    }
    this._collectTriggerEvents();
    if (this._filterChangedShapeIds.size > 0) {
      this._filterChangedShapeIds.clear();
    }
  }

  setContactEventEnabled(enabled: boolean): void {
    if (this._contactEventsEnabled === enabled) return;
    this._contactEventsEnabled = enabled;
    for (let it = this._colliders.values(), cur = it.next(); !cur.done; cur = it.next()) {
      cur.value._updateEventMask(enabled);
    }
    if (!enabled) {
      this._contactEventCount = 0;
      this._activeContactPairs.clear();
      this._activeKinematicPairs.clear();
    }
  }

  updateEvents(): IPhysicsEvents {
    const physicsEvents = this._physicsEvents;
    const active = this._activeTriggers;
    const triggerEvents = this._triggerEvents;
    const pool = this._triggerEventPool;
    const pairMap = this._triggerPairMap;

    triggerEvents.length = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const event = active[i];
      event.dispatchState = event.state;
      triggerEvents.push(event);
      if (event.state === PhysicsEventState.Enter) {
        event.state = PhysicsEventState.Stay;
      } else if (event.state === PhysicsEventState.Exit) {
        const last = active.length - 1;
        if (i !== last) {
          active[i] = active[last];
        }
        active.length = last;
        if (pairMap.get(event.key) === event) {
          pairMap.delete(event.key);
        }
        pool.push(event);
      }
    }

    physicsEvents.contactEventCount = this._contactEventCount;
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
    const sx = origin.x;
    const sy = origin.y;
    const sz = origin.z;
    const ex = sx + direction.x * clampedDist;
    const ey = sy + direction.y * clampedDist;
    const ez = sz + direction.z * clampedDist;
    const wantOut = outHitResult !== undefined;

    // Fast path: capacity=1 closest-hit collector (shrinks Havok BVH earlyOutFraction automatically).
    const singleHits = this._execRayCast(false, sx, sy, sz, ex, ey, ez, filterMask);
    if (singleHits === 0) return false;

    const hit0 = this._readQueryHit(QueryKind.Ray, this._singleCollector, 0, wantOut);
    if (this._tryEmitSingleHit(hit0, clampedDist, outHitResult)) {
      return true;
    }

    // Fallback to multi-collector when closest hit was frac <= 0 or excluded from scene queries.
    const numHits = this._execRayCast(true, sx, sy, sz, ex, ey, ez, filterMask);
    return this._resolveMultiClosestHit(QueryKind.Ray, numHits, clampedDist, outHitResult);
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
    const sx = origin.x;
    const sy = origin.y;
    const sz = origin.z;
    const ex = sx + direction.x * clampedDist;
    const ey = sy + direction.y * clampedDist;
    const ez = sz + direction.z * clampedDist;

    const numHits = this._execRayCast(true, sx, sy, sz, ex, ey, ez, filterMask);
    if (numHits === 0) return;

    // Single-hit fast path: skip deduplication map entirely.
    if (numHits === 1) {
      this._tryEmitSingleHit(this._readQueryHit(QueryKind.Ray, this._multiCollector, 0, true), clampedDist, onHit);
      return;
    }

    const pos = HavokPhysicsScene._tempVecA;
    const norm = HavokPhysicsScene._tempVecB;

    // Match PhysX default raycastAll (without eMESH_MULTIPLE): keep the closest hit per collider shape.
    const reentrant = this._inRaycastAll;
    const indexMap = reentrant ? new Map<number, number>() : this._raycastAllIndexMap;
    const records = reentrant ? ([] as RaycastHitRecord[]) : this._raycastAllRecords;
    if (!reentrant) {
      this._inRaycastAll = true;
    }

    try {
      indexMap.clear();
      let recordCount = 0;

      for (let i = 0; i < numHits; i++) {
        const h = this._readQueryHit(QueryKind.Ray, this._multiCollector, i, true);
        if (h.frac <= 0) continue;
        const shape = this._resolveQueryContactShape(h.bodyPtr, h.shapePtr);
        if (!shape || !shape._isSceneQuery) continue;
        const existingIdx = indexMap.get(shape._id);
        if (existingIdx !== undefined) {
          const rec = records[existingIdx];
          if (h.frac >= rec.frac) continue;
          rec.frac = h.frac;
          rec.px = h.px;
          rec.py = h.py;
          rec.pz = h.pz;
          rec.nx = h.nx;
          rec.ny = h.ny;
          rec.nz = h.nz;
        } else {
          const idx = recordCount++;
          let rec = records[idx];
          if (!rec) {
            rec = { id: 0, frac: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 };
            records[idx] = rec;
          }
          rec.id = shape._id;
          rec.frac = h.frac;
          rec.px = h.px;
          rec.py = h.py;
          rec.pz = h.pz;
          rec.nx = h.nx;
          rec.ny = h.ny;
          rec.nz = h.nz;
          indexMap.set(shape._id, idx);
        }
      }

      indexMap.clear();
      for (let i = 0; i < recordCount; i++) {
        const h = records[i];
        pos.set(h.px, h.py, h.pz);
        norm.set(h.nx, h.ny, h.nz);
        onHit(h.id, h.frac * clampedDist, pos, norm);
      }
    } finally {
      if (!reentrant) {
        this._inRaycastAll = false;
      }
    }
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
    const entry = this._getCachedBoxQueryShape(sx, sy, sz, mask);
    return this._shapeCastSingle(entry, center, orientation, direction, distance, outHitResult);
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
    const entry = this._getCachedSphereQueryShape(Math.max(Math.abs(radius), MIN_QUERY_DIM), mask);
    return this._shapeCastSingle(entry, center, null, direction, distance, outHitResult);
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
    const entry = this._getCachedCapsuleQueryShape(r, halfH, mask);
    return this._shapeCastSingle(entry, center, orientation, direction, distance, outHitResult);
  }

  overlapBoxAll(center: Vector3, orientation: Quaternion, halfExtents: Vector3, layerMask: number): ArrayLike<number> {
    const mask = layerMask >>> 0;
    if (mask === 0) return this._emptyOverlap();
    this._flushDirtyColliders();
    const sx = Math.max(Math.abs(halfExtents.x) * 2, MIN_QUERY_DIM);
    const sy = Math.max(Math.abs(halfExtents.y) * 2, MIN_QUERY_DIM);
    const sz = Math.max(Math.abs(halfExtents.z) * 2, MIN_QUERY_DIM);
    const entry = this._getCachedBoxQueryShape(sx, sy, sz, mask);
    return this._overlapShapeAll(entry, center, orientation);
  }

  overlapSphereAll(center: Vector3, radius: number, layerMask: number): ArrayLike<number> {
    const mask = layerMask >>> 0;
    if (mask === 0) return this._emptyOverlap();
    this._flushDirtyColliders();
    const entry = this._getCachedSphereQueryShape(Math.max(Math.abs(radius), MIN_QUERY_DIM), mask);
    return this._overlapShapeAll(entry, center, null);
  }

  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    layerMask: number
  ): ArrayLike<number> {
    const mask = layerMask >>> 0;
    if (mask === 0) return this._emptyOverlap();
    this._flushDirtyColliders();
    const halfH = Math.max(Math.abs(height) * 0.5, MIN_QUERY_DIM);
    const r = Math.max(Math.abs(radius), MIN_QUERY_DIM);
    const entry = this._getCachedCapsuleQueryShape(r, halfH, mask);
    return this._overlapShapeAll(entry, center, orientation);
  }

  /** @internal Unified ShapeCast for HavokCharacterController with capacity=1 fast path & >256 hit grow fallback. */
  _castShapeForController(
    shape: HP_ShapeId,
    shapePtr: number,
    sx: number,
    sy: number,
    sz: number,
    dx: number,
    dy: number,
    dz: number,
    ignoreBody: HP_BodyId,
    ignoreBodyPtr: number,
    outHit: { fraction: number; nx: number; ny: number; nz: number }
  ): boolean {
    const ex = sx + dx;
    const ey = sy + dy;
    const ez = sz + dz;

    const singleHits = this._execShapeCast(
      false,
      shape,
      shapePtr,
      IDENTITY_QUAT,
      sx,
      sy,
      sz,
      ex,
      ey,
      ez,
      false,
      ignoreBody,
      ignoreBodyPtr
    );
    if (singleHits === 0) return false;

    const h0 = this._readQueryHit(QueryKind.ShapeCast, this._singleCollector, 0, true);
    if (h0.frac > 0 || (h0.frac === 0 && dx * h0.nx + dy * h0.ny + dz * h0.nz < -1e-6)) {
      outHit.fraction = h0.frac;
      outHit.nx = h0.nx;
      outHit.ny = h0.ny;
      outHit.nz = h0.nz;
      return true;
    }

    const numHits = this._execShapeCast(
      true,
      shape,
      shapePtr,
      IDENTITY_QUAT,
      sx,
      sy,
      sz,
      ex,
      ey,
      ez,
      false,
      ignoreBody,
      ignoreBodyPtr
    );
    let bestFrac = 2;
    let bestNx = 0,
      bestNy = 1,
      bestNz = 0;
    for (let i = 0; i < numHits; i++) {
      const h = this._readQueryHit(QueryKind.ShapeCast, this._multiCollector, i, true);
      if (h.frac < 0 || h.frac >= bestFrac) continue;
      // Ignore grazing/backfacing hits at fraction == 0 when moving parallel to or away from the surface.
      if (h.frac === 0 && dx * h.nx + dy * h.ny + dz * h.nz >= -1e-6) continue;
      bestFrac = h.frac;
      bestNx = h.nx;
      bestNy = h.ny;
      bestNz = h.nz;
    }
    if (bestFrac > 1) return false;
    outHit.fraction = bestFrac;
    outHit.nx = bestNx;
    outHit.ny = bestNy;
    outHit.nz = bestNz;
    return true;
  }

  /** @internal Read distance and hit normal for index `i` of the last `_execShapeProx` call. */
  _readShapeProximityHitDistAndNormal(hitIndex: number, outNormal: Vector3): number {
    const h = this._readQueryHit(QueryKind.ShapeProximity, this._multiCollector, hitIndex, true);
    outNormal.set(h.nx, h.ny, h.nz);
    return h.frac;
  }

  gc(): void {
    this._contactEvents.length = this._contactEventCount;
    this._triggerEventPool.length = 0;
    if (!this._inRaycastAll) {
      this._raycastAllRecords.length = 0;
      this._raycastAllIndexMap.clear();
    }
    this._releaseQueryShapeCaches();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._havokPhysics._unregisterScene(this);
    const hk = this._havokPhysics._hk;
    while (this._joints.length > 0) {
      this._joints[this._joints.length - 1].destroy();
    }
    for (let it = this._controllers.values(), cur = it.next(); !cur.done; cur = it.next()) {
      this.removeCharacterController(cur.value);
    }
    for (let it = this._colliders.values(), cur = it.next(); !cur.done; cur = it.next()) {
      this.removeCollider(cur.value);
    }
    this._releaseQueryShapeCaches();
    if (hk) {
      if (this._queryScratchPtr !== 0) {
        hk._free(this._queryScratchPtr);
      }
      hk.HP_QueryCollector_Release(this._singleCollector);
      hk.HP_QueryCollector_Release(this._multiCollector);
      hk.HP_World_RemoveBody(this._hkWorld, this._worldAnchorBody);
      hk.HP_Body_Release(this._worldAnchorBody);
      hk.HP_World_Release(this._hkWorld);
    }
    this._queryScratchPtr = 0;
    this._colliders.clear();
    this._controllers.clear();
    this._pendingForceList.length = 0;
    this._pendingKinematicMoveList.length = 0;
    this._kinematicResetList.length = 0;
    this._clampedAngVelList.length = 0;
    this._kinProbeQueue.length = 0;
    this._highAngVelCount = 0;
    this._stepDirtyColliders.length = 0;
    this._broadphaseDirtyColliders.length = 0;
    this._broadphaseDirtyControllers.length = 0;
    this._filterDirtyControllers.length = 0;
    this._filterChangedShapeIds.clear();
    this._bodyToCollider.clear();
    this._bodyToController.clear();
    this._activeContactPairs.clear();
    this._activeKinematicPairs.clear();
    this._stepContactMap.clear();
    this._stepFinishedKeys.length = 0;
    this._contactEvents.length = 0;
    this._contactEventCount = 0;
    this._removedShapeIds.clear();
    this._triggerPairMap.clear();
    this._activeTriggers.length = 0;
    this._triggerEvents.length = 0;
    this._triggerEventPool.length = 0;
    this._overlapResultBuffer.length = 0;
    this._overlapSeen.clear();
    this._raycastAllIndexMap.clear();
    this._raycastAllRecords.length = 0;
    this._physicsEvents.contactEventCount = 0;
  }

  private _addClampedAngVel(dyn: HavokDynamicCollider): void {
    if ((dyn._sceneFlags & DYN_IN_CLAMPED_ANG_VEL) === 0) {
      dyn._sceneFlags |= DYN_IN_CLAMPED_ANG_VEL;
      this._clampedAngVelList.push(dyn);
    }
  }

  private _removeClampedAngVel(dyn: HavokDynamicCollider): void {
    if ((dyn._sceneFlags & DYN_IN_CLAMPED_ANG_VEL) !== 0) {
      dyn._sceneFlags &= ~DYN_IN_CLAMPED_ANG_VEL;
      swapRemove(this._clampedAngVelList, dyn);
    }
  }

  private _ensureUnlimitedWorldSpeed(): void {
    if (this._worldMaxAngVel >= UNLIMITED_SPEED) return;
    this._worldMaxAngVel = UNLIMITED_SPEED;
    this._havokPhysics._hk.HP_World_SetSpeedLimit(this._hkWorld, UNLIMITED_SPEED, UNLIMITED_SPEED);
    // Existing default-100 dynamic bodies need explicit JS clamping while the world limit is raised.
    for (let it = this._colliders.values(), cur = it.next(); !cur.done; cur = it.next()) {
      const c = cur.value;
      if (c._isDynamic) {
        const dyn = c as HavokDynamicCollider;
        if (!dyn._isKinematic && dyn._maxAngularVelocityRad < 1e5) {
          this._addClampedAngVel(dyn);
        }
      }
    }
  }

  private _registerDynamicSpeedLimit(dyn: HavokDynamicCollider): void {
    const maxR = dyn._maxAngularVelocityRad;
    if (maxR > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS) {
      this._highAngVelCount++;
      if (maxR < 1e5) {
        this._addClampedAngVel(dyn);
      }
    } else if (Math.abs(maxR - DEFAULT_MAX_ANG_VEL) > ANG_VEL_EPS || this._worldMaxAngVel > DEFAULT_MAX_ANG_VEL) {
      this._addClampedAngVel(dyn);
    }
  }

  private _unregisterDynamicSpeedLimit(dyn: HavokDynamicCollider, rad: number): void {
    this._removeClampedAngVel(dyn);
    if (rad > DEFAULT_MAX_ANG_VEL + ANG_VEL_EPS) {
      this._highAngVelCount--;
      if (this._highAngVelCount === 0 && this._worldMaxAngVel > DEFAULT_MAX_ANG_VEL) {
        this._worldMaxAngVel = DEFAULT_MAX_ANG_VEL;
        const hk = this._havokPhysics._hk;
        if (hk) {
          hk.HP_World_SetSpeedLimit(this._hkWorld, UNLIMITED_SPEED, DEFAULT_MAX_ANG_VEL);
        }
        // Any default-100 bodies added while world limit was 1e6 are now clamped natively at 100 by Havok.
        const list = this._clampedAngVelList;
        for (let i = list.length - 1; i >= 0; i--) {
          const item = list[i];
          if (Math.abs(item._maxAngularVelocityRad - DEFAULT_MAX_ANG_VEL) <= ANG_VEL_EPS) {
            item._sceneFlags &= ~DYN_IN_CLAMPED_ANG_VEL;
            const last = list.length - 1;
            if (i !== last) list[i] = list[last];
            list.length = last;
          }
        }
      }
    }
  }

  private _markShapeTriggersPendingExit(id: number): void {
    const active = this._activeTriggers;
    for (let i = 0, n = active.length; i < n; i++) {
      const ev = active[i];
      if (ev.index1 === id || ev.index2 === id) {
        ev.state = PhysicsEventState.Exit;
        ev.overlapCount = 0;
      }
    }
  }

  private _releaseRemovedShapes(): void {
    const removed = this._removedShapeIds;
    if (removed.size === 0) return;

    const active = this._activeTriggers;
    const pool = this._triggerEventPool;
    const pairMap = this._triggerPairMap;
    for (let i = active.length - 1; i >= 0; i--) {
      const ev = active[i];
      if (removed.has(ev.index1) || removed.has(ev.index2)) {
        const last = active.length - 1;
        if (i !== last) {
          active[i] = active[last];
        }
        active.length = last;
        if (pairMap.get(ev.key) === ev) {
          pairMap.delete(ev.key);
        }
        pool.push(ev);
      }
    }
    removed.clear();
  }

  private _reinsertController(ctrl: HavokCharacterController): boolean {
    if (!ctrl._hkBody) return false;
    const hk = this._havokPhysics._hk;
    hk.HP_World_RemoveBody(this._hkWorld, ctrl._hkBody);
    hk.HP_World_AddBody(this._hkWorld, ctrl._hkBody, false);
    return true;
  }

  private _growCollector(): void {
    const hk = this._havokPhysics._hk;
    hk.HP_QueryCollector_Release(this._multiCollector);
    this._collectorCapacity *= 2;
    this._multiCollector = hk.HP_QueryCollector_Create(this._collectorCapacity)[1];
  }

  private _applyQueryShapeFilter(entry: CachedQueryShape, layerMask: number): CachedQueryShape {
    if (entry.filterMask !== layerMask) {
      entry.filterMask = layerMask;
      const filter = HavokPhysicsScene._tempFilter;
      filter[0] = 0xffffffff;
      filter[1] = layerMask;
      this._havokPhysics._hk.HP_Shape_SetFilterInfo(entry.shape, filter);
    }
    return entry;
  }

  private _evictOldestQueryShape<K>(cache: Map<K, CachedQueryShape>): void {
    if (cache.size < MAX_QUERY_SHAPE_CACHE) return;
    const oldest = cache.entries().next();
    if (oldest.done) return;
    const [key, entry] = oldest.value;
    cache.delete(key);
    this._havokPhysics._hk.HP_Shape_Release(entry.shape);
  }

  private _getCachedSphereQueryShape(radius: number, layerMask: number): CachedQueryShape {
    if (this._lastSphereEntry && this._lastSphereR === radius) {
      return this._applyQueryShapeFilter(this._lastSphereEntry, layerMask);
    }
    const cache = this._sphereQueryCache;
    let entry = cache.get(radius);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const shape = this._havokPhysics._hk.HP_Shape_CreateSphere(ZERO_VEC3, radius)[1];
      // HP_Shape_Create* defaults filterInfo to [0xffffffff, 0xffffffff].
      entry = { shape, shapePtr: Number(shape[0]), filterMask: 0xffffffff };
      cache.set(radius, entry);
    }
    this._lastSphereR = radius;
    this._lastSphereEntry = entry;
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _getCachedBoxQueryShape(sx: number, sy: number, sz: number, layerMask: number): CachedQueryShape {
    if (this._lastBoxEntry && this._lastBoxX === sx && this._lastBoxY === sy && this._lastBoxZ === sz) {
      return this._applyQueryShapeFilter(this._lastBoxEntry, layerMask);
    }
    const key = `${sx}_${sy}_${sz}`;
    const cache = this._boxQueryCache;
    let entry = cache.get(key);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const ext = SCRATCH_VEC3_A;
      ext[0] = sx;
      ext[1] = sy;
      ext[2] = sz;
      const shape = this._havokPhysics._hk.HP_Shape_CreateBox(ZERO_VEC3, IDENTITY_QUAT, ext)[1];
      entry = { shape, shapePtr: Number(shape[0]), filterMask: 0xffffffff };
      cache.set(key, entry);
    }
    this._lastBoxX = sx;
    this._lastBoxY = sy;
    this._lastBoxZ = sz;
    this._lastBoxEntry = entry;
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _getCachedCapsuleQueryShape(radius: number, halfH: number, layerMask: number): CachedQueryShape {
    if (this._lastCapEntry && this._lastCapR === radius && this._lastCapHalfH === halfH) {
      return this._applyQueryShapeFilter(this._lastCapEntry, layerMask);
    }
    const key = `${radius}_${halfH}`;
    const cache = this._capsuleQueryCache;
    let entry = cache.get(key);
    if (!entry) {
      this._evictOldestQueryShape(cache);
      const capA = SCRATCH_VEC3_A;
      const capB = SCRATCH_VEC3_B;
      capA[0] = -halfH;
      capA[1] = 0;
      capA[2] = 0;
      capB[0] = halfH;
      capB[1] = 0;
      capB[2] = 0;
      const shape = this._havokPhysics._hk.HP_Shape_CreateCapsule(capA, capB, radius)[1];
      entry = { shape, shapePtr: Number(shape[0]), filterMask: 0xffffffff };
      cache.set(key, entry);
    }
    this._lastCapR = radius;
    this._lastCapHalfH = halfH;
    this._lastCapEntry = entry;
    return this._applyQueryShapeFilter(entry, layerMask);
  }

  private _clearQueryCache<K>(cache: Map<K, CachedQueryShape>): void {
    const hk = this._havokPhysics._hk;
    if (hk) {
      for (let it = cache.values(), cur = it.next(); !cur.done; cur = it.next()) {
        hk.HP_Shape_Release(cur.value.shape);
      }
    }
    cache.clear();
  }

  private _releaseQueryShapeCaches(): void {
    this._clearQueryCache(this._sphereQueryCache);
    this._clearQueryCache(this._boxQueryCache);
    this._clearQueryCache(this._capsuleQueryCache);
    this._lastSphereEntry = null;
    this._lastSphereR = -1;
    this._lastBoxEntry = null;
    this._lastBoxX = -1;
    this._lastBoxY = -1;
    this._lastBoxZ = -1;
    this._lastCapEntry = null;
    this._lastCapR = -1;
    this._lastCapHalfH = -1;
  }

  private _emptyOverlap(): ArrayLike<number> {
    this._overlapResultBuffer.length = 0;
    return this._overlapResultBuffer;
  }

  private _dispatchQuery(kind: QueryKind, useMulti: boolean, inPtr: number): number {
    const hk = this._havokPhysics._hk;
    const outPtr = inPtr + 64;
    const outIdx = outPtr >>> 2;
    const worldId = this._hkWorld[0];
    while (true) {
      const collector = useMulti ? this._multiCollector : this._singleCollector;
      let numHits: number;
      if (inPtr !== 0) {
        const collectorId = collector[0];
        if (kind === QueryKind.Ray) {
          hk._HP_World_CastRayWithCollector!(worldId, collectorId, inPtr);
        } else if (kind === QueryKind.ShapeCast) {
          hk._HP_World_ShapeCastWithCollector!(worldId, collectorId, inPtr);
        } else {
          hk._HP_World_ShapeProximityWithCollector!(worldId, collectorId, inPtr);
        }
        hk._HP_QueryCollector_GetNumHits!(collectorId, outPtr);
        numHits = hk.HEAPU32[outIdx];
      } else {
        if (kind === QueryKind.Ray) {
          hk.HP_World_CastRayWithCollector(this._hkWorld, collector, HavokPhysicsScene._tempRayInput);
        } else if (kind === QueryKind.ShapeCast) {
          hk.HP_World_ShapeCastWithCollector(this._hkWorld, collector, HavokPhysicsScene._tempShapeCastInput);
        } else {
          hk.HP_World_ShapeProximityWithCollector(this._hkWorld, collector, HavokPhysicsScene._tempShapeProxInput);
        }
        numHits = hk.HP_QueryCollector_GetNumHits(collector)[1];
      }
      if (!useMulti || numHits < this._collectorCapacity || this._collectorCapacity >= MAX_COLLECTOR_CAPACITY) {
        return numHits;
      }
      this._growCollector();
    }
  }

  private _execRayCast(
    useMulti: boolean,
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    layerMask: number
  ): number {
    const inPtr = this._queryScratchPtr;
    if (inPtr !== 0) {
      const hk = this._havokPhysics._hk;
      const inBase = inPtr >>> 2;
      const f32 = hk.HEAPF32;
      const u32 = hk.HEAPU32;
      f32[inBase] = sx;
      f32[inBase + 1] = sy;
      f32[inBase + 2] = sz;
      f32[inBase + 3] = ex;
      f32[inBase + 4] = ey;
      f32[inBase + 5] = ez;
      u32[inBase + 6] = 0xffffffff;
      u32[inBase + 7] = layerMask;
      u32[inBase + 8] = 1; // shouldHitTriggers = true
      u32[inBase + 9] = 0;
      u32[inBase + 10] = 0;
      u32[inBase + 11] = 0;
      return this._dispatchQuery(QueryKind.Ray, useMulti, inPtr);
    }
    const input = HavokPhysicsScene._tempRayInput;
    input[0][0] = sx;
    input[0][1] = sy;
    input[0][2] = sz;
    input[1][0] = ex;
    input[1][1] = ey;
    input[1][2] = ez;
    input[2][1] = layerMask;
    return this._dispatchQuery(QueryKind.Ray, useMulti, 0);
  }

  private _execShapeCast(
    useMulti: boolean,
    shape: HP_ShapeId,
    shapePtr: number,
    rot: HKQuaternion,
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    hitTriggers: boolean,
    ignoreBody: HP_BodyId,
    ignoreBodyPtr: number
  ): number {
    const inPtr = this._queryScratchPtr;
    if (inPtr !== 0) {
      const hk = this._havokPhysics._hk;
      const inBase = inPtr >>> 2;
      const f32 = hk.HEAPF32;
      const u32 = hk.HEAPU32;
      u32[inBase] = shapePtr;
      u32[inBase + 1] = 0;
      f32[inBase + 2] = rot[0];
      f32[inBase + 3] = rot[1];
      f32[inBase + 4] = rot[2];
      f32[inBase + 5] = rot[3];
      f32[inBase + 6] = sx;
      f32[inBase + 7] = sy;
      f32[inBase + 8] = sz;
      f32[inBase + 9] = ex;
      f32[inBase + 10] = ey;
      f32[inBase + 11] = ez;
      u32[inBase + 12] = hitTriggers ? 1 : 0;
      u32[inBase + 13] = 0;
      u32[inBase + 14] = ignoreBodyPtr;
      u32[inBase + 15] = 0;
      return this._dispatchQuery(QueryKind.ShapeCast, useMulti, inPtr);
    }
    const input = HavokPhysicsScene._tempShapeCastInput;
    input[0] = shape;
    input[1] = rot;
    input[2][0] = sx;
    input[2][1] = sy;
    input[2][2] = sz;
    input[3][0] = ex;
    input[3][1] = ey;
    input[3][2] = ez;
    input[4] = hitTriggers;
    input[5] = ignoreBody;
    return this._dispatchQuery(QueryKind.ShapeCast, useMulti, 0);
  }

  /** @internal Unified ShapeProximity multi-hit query with >256 hit collector growth. */
  _execShapeProx(
    shape: HP_ShapeId,
    shapePtr: number,
    px: number,
    py: number,
    pz: number,
    rot: HKQuaternion,
    maxDist: number,
    hitTriggers: boolean,
    ignoreBody: HP_BodyId,
    ignoreBodyPtr: number
  ): number {
    const inPtr = this._queryScratchPtr;
    if (inPtr !== 0) {
      const hk = this._havokPhysics._hk;
      const inBase = inPtr >>> 2;
      const f32 = hk.HEAPF32;
      const u32 = hk.HEAPU32;
      u32[inBase] = shapePtr;
      u32[inBase + 1] = 0;
      f32[inBase + 2] = px;
      f32[inBase + 3] = py;
      f32[inBase + 4] = pz;
      f32[inBase + 5] = rot[0];
      f32[inBase + 6] = rot[1];
      f32[inBase + 7] = rot[2];
      f32[inBase + 8] = rot[3];
      f32[inBase + 9] = maxDist;
      u32[inBase + 10] = hitTriggers ? 1 : 0;
      u32[inBase + 11] = 0;
      u32[inBase + 12] = ignoreBodyPtr;
      u32[inBase + 13] = 0;
      return this._dispatchQuery(QueryKind.ShapeProximity, true, inPtr);
    }
    const input = HavokPhysicsScene._tempShapeProxInput;
    input[0] = shape;
    input[1][0] = px;
    input[1][1] = py;
    input[1][2] = pz;
    input[2] = rot;
    input[3] = maxDist;
    input[4] = hitTriggers;
    input[5] = ignoreBody;
    return this._dispatchQuery(QueryKind.ShapeProximity, true, 0);
  }

  private _readQueryHit(
    kind: QueryKind,
    collector: HP_CollectorId,
    index: number,
    readPosNorm: boolean
  ): QueryHitScratch {
    const hk = this._havokPhysics._hk;
    const hit = HavokPhysicsScene._tempHit;
    const ptr = this._queryScratchPtr;
    if (ptr !== 0) {
      const outPtr = ptr + 64;
      const b = outPtr >>> 2;
      const collectorId = collector[0];
      let cpBase: number;
      if (kind === QueryKind.Ray) {
        hk._HP_QueryCollector_GetCastRayResult!(collectorId, index, outPtr);
        cpBase = b + 2;
      } else {
        if (kind === QueryKind.ShapeCast) {
          hk._HP_QueryCollector_GetShapeCastResult!(collectorId, index, outPtr);
        } else {
          hk._HP_QueryCollector_GetShapeProximityResult!(collectorId, index, outPtr);
        }
        cpBase = b + 18;
      }
      const f32 = hk.HEAPF32;
      const u32 = hk.HEAPU32;
      hit.frac = f32[b];
      hit.bodyPtr = u32[cpBase];
      hit.shapePtr = u32[cpBase + 2];
      if (readPosNorm) {
        hit.px = f32[cpBase + 8];
        hit.py = f32[cpBase + 9];
        hit.pz = f32[cpBase + 10];
        hit.nx = f32[cpBase + 11];
        hit.ny = f32[cpBase + 12];
        hit.nz = f32[cpBase + 13];
      }
    } else {
      let frac: number;
      let cp: HKContactPoint;
      if (kind === QueryKind.Ray) {
        const res = hk.HP_QueryCollector_GetCastRayResult(collector, index)[1];
        frac = res[0];
        cp = res[1];
      } else {
        const res = (
          kind === QueryKind.ShapeCast
            ? hk.HP_QueryCollector_GetShapeCastResult(collector, index)
            : hk.HP_QueryCollector_GetShapeProximityResult(collector, index)
        )[1];
        frac = res[0];
        cp = res[2];
      }
      hit.frac = frac;
      hit.bodyPtr = Number(cp[0][0]);
      hit.shapePtr = Number(cp[1][0]);
      if (readPosNorm) {
        const p = cp[3];
        const n = cp[4];
        hit.px = p[0];
        hit.py = p[1];
        hit.pz = p[2];
        hit.nx = n[0];
        hit.ny = n[1];
        hit.nz = n[2];
      }
    }
    return hit;
  }

  private _tryEmitSingleHit(
    hit: QueryHitScratch,
    clampedDist: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    if (hit.frac <= 0) return false;
    const shape = this._resolveQueryContactShape(hit.bodyPtr, hit.shapePtr);
    if (!shape || !shape._isSceneQuery) return false;
    if (outHitResult) {
      const pos = HavokPhysicsScene._tempVecA;
      const norm = HavokPhysicsScene._tempVecB;
      pos.set(hit.px, hit.py, hit.pz);
      norm.set(hit.nx, hit.ny, hit.nz);
      outHitResult(shape._id, hit.frac * clampedDist, pos, norm);
    }
    return true;
  }

  private _shapeCastSingle(
    entry: CachedQueryShape,
    center: Vector3,
    orientation: Quaternion | null,
    direction: Vector3,
    distance: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const clampedDist = Math.min(distance, MAX_QUERY_DISTANCE);
    const sx = center.x;
    const sy = center.y;
    const sz = center.z;
    const ex = sx + direction.x * clampedDist;
    const ey = sy + direction.y * clampedDist;
    const ez = sz + direction.z * clampedDist;

    let rotTuple: HKQuaternion = IDENTITY_QUAT;
    if (orientation !== null) {
      rotTuple = HavokPhysicsScene._tempQueryRot;
      writeNormalizedQuat(orientation, rotTuple);
    }

    const wantOut = outHitResult !== undefined;
    const singleHits = this._execShapeCast(
      false,
      entry.shape,
      entry.shapePtr,
      rotTuple,
      sx,
      sy,
      sz,
      ex,
      ey,
      ez,
      true,
      ZERO_HANDLE,
      0
    );
    if (singleHits === 0) return false;

    const hit0 = this._readQueryHit(QueryKind.ShapeCast, this._singleCollector, 0, wantOut);
    if (this._tryEmitSingleHit(hit0, clampedDist, outHitResult)) {
      return true;
    }

    const numHits = this._execShapeCast(
      true,
      entry.shape,
      entry.shapePtr,
      rotTuple,
      sx,
      sy,
      sz,
      ex,
      ey,
      ez,
      true,
      ZERO_HANDLE,
      0
    );
    return this._resolveMultiClosestHit(QueryKind.ShapeCast, numHits, clampedDist, outHitResult);
  }

  private _resolveMultiClosestHit(
    kind: QueryKind,
    numHits: number,
    clampedDist: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const wantOut = outHitResult !== undefined;
    let bestFrac = 2;
    let bestShapeId = -1;
    let bestPx = 0,
      bestPy = 0,
      bestPz = 0;
    let bestNx = 0,
      bestNy = 0,
      bestNz = 0;

    for (let i = 0; i < numHits; i++) {
      const h = this._readQueryHit(kind, this._multiCollector, i, wantOut);
      if (h.frac <= 0 || h.frac >= bestFrac) continue;
      const shape = this._resolveQueryContactShape(h.bodyPtr, h.shapePtr);
      if (!shape || !shape._isSceneQuery) continue;
      if (!wantOut) return true;
      bestFrac = h.frac;
      bestShapeId = shape._id;
      bestPx = h.px;
      bestPy = h.py;
      bestPz = h.pz;
      bestNx = h.nx;
      bestNy = h.ny;
      bestNz = h.nz;
    }

    if (bestShapeId === -1) return false;
    const pos = HavokPhysicsScene._tempVecA;
    const norm = HavokPhysicsScene._tempVecB;
    pos.set(bestPx, bestPy, bestPz);
    norm.set(bestNx, bestNy, bestNz);
    outHitResult!(bestShapeId, bestFrac * clampedDist, pos, norm);
    return true;
  }

  private _overlapShapeAll(
    entry: CachedQueryShape,
    center: Vector3,
    orientation: Quaternion | null
  ): ArrayLike<number> {
    let rotTuple: HKQuaternion = IDENTITY_QUAT;
    if (orientation !== null) {
      rotTuple = HavokPhysicsScene._tempQueryRot;
      writeNormalizedQuat(orientation, rotTuple);
    }

    const numHits = this._execShapeProx(
      entry.shape,
      entry.shapePtr,
      center.x,
      center.y,
      center.z,
      rotTuple,
      0,
      true,
      ZERO_HANDLE,
      0
    );

    const out = this._overlapResultBuffer;
    const seen = this._overlapSeen;
    out.length = 0;
    if (numHits === 0) return out;
    seen.clear();

    for (let i = 0; i < numHits; i++) {
      const h = this._readQueryHit(QueryKind.ShapeProximity, this._multiCollector, i, false);
      const shape = this._resolveQueryContactShape(h.bodyPtr, h.shapePtr);
      if (!shape || !shape._isSceneQuery) continue;
      const prevSize = seen.size;
      seen.add(shape._id);
      if (seen.size !== prevSize) {
        out.push(shape._id);
      }
    }
    return out;
  }

  private _resolveColliderShapeByPtr(collider: HavokCollider, shapePtr: number): HavokShapeIdentity | null {
    const shapes = collider._shapes;
    const len = shapes.length;
    if (len === 0) return null;
    if (len === 1) return shapes[0];
    for (let i = 0; i < len; i++) {
      if (shapes[i]._hkShapePtr === shapePtr) {
        return shapes[i];
      }
    }
    return shapes[0];
  }

  private _resolveQueryContactShape(bodyPtr: number, shapePtr: number): HavokShapeIdentity | null {
    const collider = this._bodyToCollider.get(bodyPtr);
    if (collider) {
      return this._resolveColliderShapeByPtr(collider, shapePtr);
    }
    return this._bodyToController.size > 0 ? (this._bodyToController.get(bodyPtr) ?? null) : null;
  }

  private _resolveCollisionShape(
    bodyPtr: number,
    iterPtr: number,
    shapePath: [HP_ShapeId, bigint] | null
  ): HavokShapeIdentity | null {
    const collider = this._bodyToCollider.get(bodyPtr);
    if (collider) {
      const shapes = collider._shapes;
      const len = shapes.length;
      if (len === 0) return null;
      if (len === 1) return shapes[0];
      const hk = this._havokPhysics._hk;
      let childIdx = -1;
      if (shapePath === null) {
        const scratch = this._queryScratchPtr;
        if (hk._HP_ShapePathIterator_GetNext!(iterPtr, scratch, scratch + 16) === hk.Result.RESULT_OK.value) {
          childIdx = hk.HEAP32[(scratch + 16) >>> 2];
        }
      } else {
        const [res, , idx] = hk.HP_Shape_PathIterator_GetNext(shapePath);
        if (res.value === hk.Result.RESULT_OK.value) {
          childIdx = idx;
        }
      }
      return childIdx >= 0 && childIdx < len ? shapes[childIdx] : shapes[0];
    }
    return this._bodyToController.size > 0 ? (this._bodyToController.get(bodyPtr) ?? null) : null;
  }

  private _addContactPoint(
    key: number,
    id0: number,
    id1: number,
    kinProbeCollider: HavokDynamicCollider | null,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    ix: number,
    iy: number,
    iz: number,
    sep: number
  ): void {
    let event = this._stepContactMap.get(key);
    if (!event) {
      const wasActive = this._activeContactPairs.has(key);
      const idx = this._contactEventCount++;
      event = this._contactEvents[idx] ||= new ContactEvent();
      event.shape0Id = id0;
      event.shape1Id = id1;
      event.state = wasActive ? PhysicsEventState.Stay : PhysicsEventState.Enter;
      event._bufferedContacts.contactCount = 0;
      this._stepContactMap.set(key, event);

      if (!wasActive) {
        this._activeContactPairs.add(key);
      }
      if (kinProbeCollider) {
        this._activeKinematicPairs.set(key, kinProbeCollider);
      } else if (wasActive && this._activeKinematicPairs.size > 0) {
        this._activeKinematicPairs.delete(key);
      }
    }

    const buffered = event._bufferedContacts;
    const cIdx = buffered.contactCount++;
    const dst = (buffered.contacts[cIdx] ||= new BufferedContactPoint());
    dst.position.set(px, py, pz);
    dst.normal.set(nx, ny, nz);
    dst.impulse.set(ix, iy, iz);
    dst.separation = sep;
  }

  private _pushExitContactEvent(id0: number, id1: number): void {
    const idx = this._contactEventCount++;
    const event = (this._contactEvents[idx] ||= new ContactEvent());
    event.shape0Id = id0;
    event.shape1Id = id1;
    event.state = PhysicsEventState.Exit;
    event._bufferedContacts.contactCount = 0;
  }

  private _submitCollisionContact(
    key: number,
    id0: number,
    id1: number,
    p0x: number,
    p0y: number,
    p0z: number,
    n0x: number,
    n0y: number,
    n0z: number,
    p1x: number,
    p1y: number,
    p1z: number,
    nx: number,
    ny: number,
    nz: number,
    impulseScalar: number
  ): void {
    const sep = (p1x - p0x) * n0x + (p1y - p0y) * n0y + (p1z - p0z) * n0z;
    this._addContactPoint(
      key,
      id0,
      id1,
      null,
      p0x,
      p0y,
      p0z,
      nx,
      ny,
      nz,
      nx * impulseScalar,
      ny * impulseScalar,
      nz * impulseScalar,
      sep
    );
  }

  private _collectCollisionEvents(): void {
    const hk = this._havokPhysics._hk;
    const stepMap = this._stepContactMap;
    const finishedKeys = this._stepFinishedKeys;
    stepMap.clear();
    finishedKeys.length = 0;

    let evAddr = hk.HP_World_GetCollisionEvents(this._hkWorld)[1];
    const useRaw = this._queryScratchPtr !== 0;
    const heapU32 = useRaw ? hk.HEAPU32 : null;
    const heapF32 = useRaw ? hk.HEAPF32 : null;

    while (evAddr !== 0) {
      let evType = 0;
      let shapeA: HavokShapeIdentity | null = null;
      let shapeB: HavokShapeIdentity | null = null;
      let eb = 0;
      let embindEv: ReturnType<HavokPhysics["_hk"]["HP_Event_AsCollision"]>[1] | null = null;

      if (useRaw) {
        // Tier 2: read HP_CollisionEvent directly from WASM HEAPU32/HEAPF32 (0 Embind tuple allocations).
        eb = evAddr >>> 2;
        evType = heapU32![eb];
        shapeA = this._resolveCollisionShape(heapU32![eb + 2], evAddr + 24, null);
        shapeB = this._resolveCollisionShape(heapU32![eb + 18], evAddr + 88, null);
      } else {
        // Tier 1 Embind fallback
        const [res, ev] = hk.HP_Event_AsCollision(evAddr);
        if (res.value === hk.Result.RESULT_OK.value) {
          embindEv = ev;
          evType = ev[0].value;
          shapeA = this._resolveCollisionShape(Number(ev[1][0][0]), 0, ev[1][2]);
          shapeB = this._resolveCollisionShape(Number(ev[2][0][0]), 0, ev[2][2]);
        }
      }

      if (shapeA && shapeB && !shapeA._isTrigger && !shapeB._isTrigger && shapeA._id !== shapeB._id) {
        const aFirst = shapeA._id < shapeB._id;
        const id0 = aFirst ? shapeA._id : shapeB._id;
        const id1 = aFirst ? shapeB._id : shapeA._id;
        const key = id0 * PAIR_KEY_STRIDE + id1;

        if (evType === HK_EVENT_COLLISION_FINISHED) {
          finishedKeys.push(key);
        } else if (useRaw) {
          const b0 = aFirst ? eb + 2 : eb + 18;
          const b1 = aFirst ? eb + 18 : eb + 2;
          const f32 = heapF32!;
          this._submitCollisionContact(
            key,
            id0,
            id1,
            f32[b0 + 8],
            f32[b0 + 9],
            f32[b0 + 10],
            f32[b0 + 11],
            f32[b0 + 12],
            f32[b0 + 13],
            f32[b1 + 8],
            f32[b1 + 9],
            f32[b1 + 10],
            f32[b1 + 11],
            f32[b1 + 12],
            f32[b1 + 13],
            f32[eb + 34]
          );
        } else {
          const c0 = aFirst ? embindEv![1] : embindEv![2];
          const c1 = aFirst ? embindEv![2] : embindEv![1];
          const p0 = c0[3];
          const p1 = c1[3];
          const n0 = c0[4];
          const n1 = c1[4];
          this._submitCollisionContact(
            key,
            id0,
            id1,
            p0[0],
            p0[1],
            p0[2],
            n0[0],
            n0[1],
            n0[2],
            p1[0],
            p1[1],
            p1[2],
            n1[0],
            n1[1],
            n1[2],
            embindEv![3]
          );
        }
      }
      evAddr = hk.HP_World_GetNextCollisionEvent(this._hkWorld, evAddr);
    }

    // Havok natively omits collision events for Kinematic vs Static and Kinematic vs Kinematic;
    // match PhysX's moved-kinematic contact reporting via ShapeProximity on kinematic bodies that moved or hold active pairs.
    if (this._kinematicResetList.length > 0 || this._activeKinematicPairs.size > 0) {
      this._collectKinematicNonDynamicContacts();
    }

    // Emit Exit for pairs that received COLLISION_FINISHED without any contact point in the same step.
    for (let i = 0, n = finishedKeys.length; i < n; i++) {
      const key = finishedKeys[i];
      if (stepMap.has(key) || !this._activeContactPairs.delete(key)) continue;
      if (this._activeKinematicPairs.size > 0) {
        this._activeKinematicPairs.delete(key);
      }
      const id1 = key % PAIR_KEY_STRIDE;
      const id0 = (key - id1) / PAIR_KEY_STRIDE;
      this._pushExitContactEvent(id0, id1);
    }

    // End active kinematic-vs-static/kinematic pairs no longer overlapping this step,
    // and active pairs whose filter/body changed in place without re-detecting contact this step.
    const filterChanged = this._filterChangedShapeIds;
    if (filterChanged.size > 0) {
      for (let it = this._activeContactPairs.values(), cur = it.next(); !cur.done; cur = it.next()) {
        const key = cur.value;
        if (stepMap.has(key)) continue;
        const id1 = key % PAIR_KEY_STRIDE;
        const id0 = (key - id1) / PAIR_KEY_STRIDE;
        if (this._activeKinematicPairs.delete(key) || filterChanged.has(id0) || filterChanged.has(id1)) {
          this._activeContactPairs.delete(key);
          this._pushExitContactEvent(id0, id1);
        }
      }
    } else if (this._activeKinematicPairs.size > 0) {
      for (let it = this._activeKinematicPairs.keys(), cur = it.next(); !cur.done; cur = it.next()) {
        const key = cur.value;
        if (stepMap.has(key)) continue;
        this._activeKinematicPairs.delete(key);
        this._activeContactPairs.delete(key);
        const id1 = key % PAIR_KEY_STRIDE;
        const id0 = (key - id1) / PAIR_KEY_STRIDE;
        this._pushExitContactEvent(id0, id1);
      }
    }
    if (stepMap.size > 0) {
      stepMap.clear();
    }
  }

  private _collectKinematicNonDynamicContacts(): void {
    const probeList = this._kinProbeQueue;
    probeList.length = 0;

    const resetList = this._kinematicResetList;
    for (let i = 0, n = resetList.length; i < n; i++) {
      const col = resetList[i];
      if ((col._sceneFlags & DYN_PROBED_THIS_STEP) === 0) {
        col._sceneFlags |= DYN_PROBED_THIS_STEP;
        probeList.push(col);
      }
    }
    if (this._activeKinematicPairs.size > 0) {
      for (let it = this._activeKinematicPairs.values(), cur = it.next(); !cur.done; cur = it.next()) {
        const col = cur.value;
        if (col._isKinematic && col._scene === this && (col._sceneFlags & DYN_PROBED_THIS_STEP) === 0) {
          col._sceneFlags |= DYN_PROBED_THIS_STEP;
          probeList.push(col);
        }
      }
    }

    const stepMap = this._stepContactMap;
    const bodyPos = HavokPhysicsScene._tempVecA;
    const bodyRot = HavokPhysicsScene._tempQuatA;
    const shapePos = HavokPhysicsScene._tempVecB;
    const shapeRot = HavokPhysicsScene._tempQuatB;
    const rotTuple = HavokPhysicsScene._tempQueryRot;

    for (let p = 0, pn = probeList.length; p < pn; p++) {
      const col = probeList[p];
      col._sceneFlags &= ~DYN_PROBED_THIS_STEP;
      const shapes = col._shapes;
      if (shapes.length === 0) continue;

      col.getWorldTransform(bodyPos, bodyRot);
      for (let i = 0, n = shapes.length; i < n; i++) {
        const s = shapes[i];
        if (!s._hkShape || s._isTrigger) continue;

        if (!s._hasNonIdentityLocalPose()) {
          shapePos.copyFrom(bodyPos);
          shapeRot.copyFrom(bodyRot);
        } else {
          Vector3.transformByQuat(s._localPosition, bodyRot, shapePos);
          shapePos.add(bodyPos);
          Quaternion.multiply(bodyRot, s._localRotation, shapeRot);
          shapeRot.normalize();
        }

        rotTuple[0] = shapeRot.x;
        rotTuple[1] = shapeRot.y;
        rotTuple[2] = shapeRot.z;
        rotTuple[3] = shapeRot.w;

        const numHits = this._execShapeProx(
          s._hkShape,
          s._hkShapePtr,
          shapePos.x,
          shapePos.y,
          shapePos.z,
          rotTuple,
          0,
          false,
          col._hkBody,
          col._hkBodyPtr
        );

        for (let h = 0; h < numHits; h++) {
          const hit = this._readQueryHit(QueryKind.ShapeProximity, this._multiCollector, h, true);
          if (hit.frac > 0) continue;

          const otherCollider = this._bodyToCollider.get(hit.bodyPtr);
          if (!otherCollider) continue;
          // Dynamic targets already emit native Havok collision events
          if (otherCollider._isDynamic && !(otherCollider as HavokDynamicCollider)._isKinematic) continue;

          const otherShape = this._resolveColliderShapeByPtr(otherCollider, hit.shapePtr);
          if (!otherShape || otherShape._isTrigger || otherShape._id === s._id) continue;

          const queryIsShape0 = s._id < otherShape._id;
          const id0 = queryIsShape0 ? s._id : otherShape._id;
          const id1 = queryIsShape0 ? otherShape._id : s._id;
          const key = id0 * PAIR_KEY_STRIDE + id1;

          if (stepMap.has(key)) continue;

          // hit normal points outward from hitShape toward queryShape; ContactPoint.normal points from shape1 -> shape0
          const sign = queryIsShape0 ? 1 : -1;
          this._addContactPoint(
            key,
            id0,
            id1,
            col,
            hit.px,
            hit.py,
            hit.pz,
            hit.nx * sign,
            hit.ny * sign,
            hit.nz * sign,
            0,
            0,
            0,
            hit.frac
          );
        }
      }
    }
    probeList.length = 0;
  }

  private _collectTriggerEvents(): void {
    const hk = this._havokPhysics._hk;
    let evAddr = hk.HP_World_GetTriggerEvents(this._hkWorld)[1];
    if (evAddr === 0 || hk.HEAPU32 == null) return;

    const heapU32 = hk.HEAPU32;
    const pairMap = this._triggerPairMap;
    const activeTriggers = this._activeTriggers;

    while (evAddr !== 0) {
      const base = evAddr >>> 2;
      const evType = heapU32[base];
      const shapeA = this._resolveQueryContactShape(heapU32[base + 2], heapU32[base + 4]);
      const shapeB = this._resolveQueryContactShape(heapU32[base + 6], heapU32[base + 8]);

      if (shapeA && shapeB && shapeA._id !== shapeB._id) {
        // Match Galacean/PhysX spec: Trigger-vs-Trigger does NOT fire trigger callbacks
        if (!(shapeA._isTrigger && shapeB._isTrigger)) {
          const id1 = shapeA._id < shapeB._id ? shapeA._id : shapeB._id;
          const id2 = shapeA._id < shapeB._id ? shapeB._id : shapeA._id;
          const key = id1 * PAIR_KEY_STRIDE + id2;

          if (evType === HK_EVENT_TRIGGER_ENTERED) {
            const existing = pairMap.get(key);
            if (existing) {
              existing.overlapCount++;
              // Trigger continuity: only restore Exit -> Stay on re-detection after reparent/re-insert/filter change;
              // keep Enter as Enter when multiple triangles of the same mesh fire TRIGGER_ENTERED in one step.
              if (existing.state === PhysicsEventState.Exit) {
                existing.state = PhysicsEventState.Stay;
              }
            } else {
              const ev = this._acquireTriggerEvent(id1, id2, key);
              ev.state = PhysicsEventState.Enter;
              ev.overlapCount = 1;
              pairMap.set(key, ev);
              activeTriggers.push(ev);
            }
          } else if (evType === HK_EVENT_TRIGGER_EXITED) {
            const ev = pairMap.get(key);
            if (ev) {
              if (ev.overlapCount <= 1) {
                ev.overlapCount = 0;
                ev.state = PhysicsEventState.Exit;
              } else {
                ev.overlapCount--;
              }
            }
          }
        }
      }

      evAddr = hk.HP_World_GetNextTriggerEvent(this._hkWorld, evAddr);
    }
  }

  private _acquireTriggerEvent(index1: number, index2: number, key: number): TriggerEvent {
    const pool = this._triggerEventPool;
    if (pool.length > 0) {
      const ev = pool.pop()!;
      ev.index1 = index1;
      ev.index2 = index2;
      ev.key = key;
      return ev;
    }
    return new TriggerEvent(index1, index2, key);
  }
}

interface CachedQueryShape {
  shape: HP_ShapeId;
  shapePtr: number;
  filterMask: number;
}

interface QueryHitScratch {
  frac: number;
  bodyPtr: number;
  shapePtr: number;
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
}

interface RaycastHitRecord {
  id: number;
  frac: number;
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
}

class TriggerEvent implements ITriggerEvent {
  state: number = 0;
  dispatchState: number = 0;
  index1: number;
  index2: number;
  key: number;
  overlapCount: number = 0;

  constructor(index1: number, index2: number, key: number) {
    this.index1 = index1;
    this.index2 = index2;
    this.key = key;
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
