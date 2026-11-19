import { Quaternion, Vector3 } from "@galacean/engine";

/** @internal */
export type HKVector3 = [number, number, number];
/** @internal */
export type HKQuaternion = [number, number, number, number];
type HKQTransform = [HKVector3, HKQuaternion];

/** @internal */
export type HP_BodyId = [bigint];
/** @internal */
export type HP_ShapeId = [bigint];
/** @internal */
export type HP_ConstraintId = [bigint];
/** @internal */
export type HP_WorldId = [bigint];
/** @internal */
export type HP_CollectorId = [bigint];
type HKShapePathIterator = [HP_ShapeId, bigint];

/** @internal */
export interface HKEnumValue {
  value: number;
}

/** @internal */
export type HKMassProperties = [HKVector3, number, HKVector3, HKQuaternion];
/** @internal */
export type HKPhysicsMaterial = [number, number, number, HKEnumValue, HKEnumValue];
/** @internal */
export type HKFilterInfo = [number, number];
/** @internal */
export type HKContactPoint = [HP_BodyId, HP_ShapeId, HKShapePathIterator, HKVector3, HKVector3, number];

/** @internal */
export const HK_EVENT_COLLISION_FINISHED = 4;
/** @internal */
export const HK_EVENT_TRIGGER_ENTERED = 8;
/** @internal */
export const HK_EVENT_TRIGGER_EXITED = 16;
/** @internal */
export const HK_EVENT_ALL_COLLISIONS = 7;
/** @internal */
export const HK_EVENT_ALL_TRIGGERS = 24;

/** @internal Dirty flags on `HavokCollider._dirtyFlags`. */
export const COL_DIRTY_SHAPE = 1;
/** @internal */
export const COL_DIRTY_FILTER = 2;
/** @internal */
export const COL_DIRTY_BROADPHASE = 4;
/** @internal */
export const COL_IN_STEP_QUEUE = 8;
/** @internal */
export const COL_IN_BROADPHASE_QUEUE = 16;

/** @internal Active-list membership flags on `HavokDynamicCollider._sceneFlags`. */
export const DYN_IN_PENDING_FORCE = 1;
/** @internal */
export const DYN_IN_PENDING_KIN_MOVE = 2;
/** @internal */
export const DYN_IN_KIN_RESET = 4;
/** @internal */
export const DYN_IN_CLAMPED_ANG_VEL = 8;
/** @internal */
export const DYN_PROBED_THIS_STEP = 16;

/** @internal Dirty flags on `HavokCharacterController._dirtyFlags`. */
export const CTRL_DIRTY_BROADPHASE = 1;
/** @internal */
export const CTRL_DIRTY_FILTER = 2;

/** @internal */
export interface HavokModule {
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;

  // Optional Tier 2 raw C-ABI entry points for zero-alloc hot paths (auto-detected at runtime)
  _HP_Body_GetQTransform?(bodyId: bigint, outQTransformPtr: number): number;
  _HP_World_CastRayWithCollector?(worldId: bigint, collectorId: bigint, inputPtr: number): number;
  _HP_World_ShapeCastWithCollector?(worldId: bigint, collectorId: bigint, inputPtr: number): number;
  _HP_World_ShapeProximityWithCollector?(worldId: bigint, collectorId: bigint, inputPtr: number): number;
  _HP_QueryCollector_GetNumHits?(collectorId: bigint, outNumHitsPtr: number): number;
  _HP_QueryCollector_GetCastRayResult?(collectorId: bigint, hitIndex: number, outResultPtr: number): number;
  _HP_QueryCollector_GetShapeCastResult?(collectorId: bigint, hitIndex: number, outResultPtr: number): number;
  _HP_QueryCollector_GetShapeProximityResult?(collectorId: bigint, hitIndex: number, outResultPtr: number): number;
  _HP_ShapePathIterator_GetNext?(curIterPtr: number, outNextIterPtr: number, outChildIdxPtr: number): number;

  Result: {
    RESULT_OK: HKEnumValue;
  };
  MotionType: {
    STATIC: HKEnumValue;
    KINEMATIC: HKEnumValue;
    DYNAMIC: HKEnumValue;
  };
  ConstraintMotorType: {
    NONE: HKEnumValue;
    VELOCITY: HKEnumValue;
  };
  ConstraintAxisLimitMode: {
    FREE: HKEnumValue;
    LIMITED: HKEnumValue;
    LOCKED: HKEnumValue;
  };
  ConstraintAxis: {
    LINEAR_X: HKEnumValue;
    LINEAR_Y: HKEnumValue;
    LINEAR_Z: HKEnumValue;
    ANGULAR_X: HKEnumValue;
    ANGULAR_Y: HKEnumValue;
    ANGULAR_Z: HKEnumValue;
    LINEAR_DISTANCE: HKEnumValue;
  };
  MaterialCombine: {
    MINIMUM: HKEnumValue;
    MAXIMUM: HKEnumValue;
    ARITHMETIC_MEAN: HKEnumValue;
    MULTIPLY: HKEnumValue;
  };
  ActivationState: {
    ACTIVE: HKEnumValue;
    INACTIVE: HKEnumValue;
  };

  HP_Shape_CreateSphere(center: HKVector3, radius: number): [HKEnumValue, HP_ShapeId];
  HP_Shape_CreateCapsule(pointA: HKVector3, pointB: HKVector3, radius: number): [HKEnumValue, HP_ShapeId];
  HP_Shape_CreateBox(center: HKVector3, rotation: HKQuaternion, extents: HKVector3): [HKEnumValue, HP_ShapeId];
  HP_Shape_CreateConvexHull(vertices: number, numVertices: number): [HKEnumValue, HP_ShapeId];
  HP_Shape_CreateMesh(
    vertices: number,
    numVertices: number,
    triangles: number,
    numTriangles: number
  ): [HKEnumValue, HP_ShapeId];
  HP_Shape_SetFilterInfo(shapeId: HP_ShapeId, filterInfo: HKFilterInfo): HKEnumValue;
  HP_Shape_SetMaterial(shapeId: HP_ShapeId, material: HKPhysicsMaterial): HKEnumValue;
  HP_Shape_CreateContainer(): [HKEnumValue, HP_ShapeId];
  HP_Shape_AddChild(
    container: HP_ShapeId,
    newChild: HP_ShapeId,
    containerFromChild: [HKVector3, HKQuaternion, HKVector3]
  ): HKEnumValue;
  HP_Shape_Release(shape: HP_ShapeId): HKEnumValue;
  HP_Shape_BuildMassProperties(shape: HP_ShapeId): [HKEnumValue, HKMassProperties];
  HP_Shape_PathIterator_GetNext(curItem: HKShapePathIterator): [HKEnumValue, HKShapePathIterator, number];
  HP_Shape_SetTrigger(shape: HP_ShapeId, isTrigger: boolean): HKEnumValue;

  HP_Body_Create(): [HKEnumValue, HP_BodyId];
  HP_Body_Release(bodyId: HP_BodyId): HKEnumValue;
  HP_Body_SetShape(bodyId: HP_BodyId, shapeId: HP_ShapeId): HKEnumValue;
  HP_Body_SetMotionType(bodyId: HP_BodyId, motionType: HKEnumValue): HKEnumValue;
  HP_Body_SetEventMask(bodyId: HP_BodyId, eventMask: number): HKEnumValue;
  HP_Body_SetMassProperties(bodyId: HP_BodyId, massProps: HKMassProperties): HKEnumValue;
  HP_Body_SetLinearDamping(bodyId: HP_BodyId, damping: number): HKEnumValue;
  HP_Body_SetAngularDamping(bodyId: HP_BodyId, damping: number): HKEnumValue;
  HP_Body_SetGravityFactor(bodyId: HP_BodyId, factor: number): HKEnumValue;
  HP_Body_SetQTransform(bodyId: HP_BodyId, transform: HKQTransform): HKEnumValue;
  HP_Body_GetQTransform(bodyId: HP_BodyId): [HKEnumValue, HKQTransform];
  HP_Body_SetLinearVelocity(bodyId: HP_BodyId, linVel: HKVector3): HKEnumValue;
  HP_Body_GetLinearVelocity(bodyId: HP_BodyId): [HKEnumValue, HKVector3];
  HP_Body_SetAngularVelocity(bodyId: HP_BodyId, angVel: HKVector3): HKEnumValue;
  HP_Body_GetAngularVelocity(bodyId: HP_BodyId): [HKEnumValue, HKVector3];
  HP_Body_SetTargetQTransform(bodyId: HP_BodyId, transform: HKQTransform): HKEnumValue;
  HP_Body_ApplyImpulse(bodyId: HP_BodyId, location: HKVector3, impulse: HKVector3): HKEnumValue;
  HP_Body_ApplyAngularImpulse(bodyId: HP_BodyId, impulse: HKVector3): HKEnumValue;
  HP_Body_SetActivationState(bodyId: HP_BodyId, activationState: HKEnumValue): HKEnumValue;
  HP_Body_GetActivationState(bodyId: HP_BodyId): [HKEnumValue, HKEnumValue];

  HP_Constraint_Create(): [HKEnumValue, HP_ConstraintId];
  HP_Constraint_Release(constraintId: HP_ConstraintId): HKEnumValue;
  HP_Constraint_SetParentBody(constraint: HP_ConstraintId, body: HP_BodyId): HKEnumValue;
  HP_Constraint_SetChildBody(constraint: HP_ConstraintId, body: HP_BodyId): HKEnumValue;
  HP_Constraint_SetAnchorInParent(
    constraint: HP_ConstraintId,
    pivot: HKVector3,
    axisX: HKVector3,
    axisY: HKVector3
  ): HKEnumValue;
  HP_Constraint_SetAnchorInChild(
    constraint: HP_ConstraintId,
    pivot: HKVector3,
    axisX: HKVector3,
    axisY: HKVector3
  ): HKEnumValue;
  HP_Constraint_SetEnabled(constraint: HP_ConstraintId, isEnabled: number): HKEnumValue;
  HP_Constraint_SetCollisionsEnabled(constraint: HP_ConstraintId, isEnabled: number): HKEnumValue;
  HP_Constraint_SetAxisMode(constraint: HP_ConstraintId, axis: HKEnumValue, limitMode: HKEnumValue): HKEnumValue;
  HP_Constraint_SetAxisMinLimit(constraint: HP_ConstraintId, axis: HKEnumValue, minLimit: number): HKEnumValue;
  HP_Constraint_SetAxisMaxLimit(constraint: HP_ConstraintId, axis: HKEnumValue, maxLimit: number): HKEnumValue;
  HP_Constraint_SetAxisStiffness(constraint: HP_ConstraintId, axis: HKEnumValue, stiffness: number): HKEnumValue;
  HP_Constraint_SetAxisDamping(constraint: HP_ConstraintId, axis: HKEnumValue, damping: number): HKEnumValue;
  HP_Constraint_SetAxisMotorType(constraint: HP_ConstraintId, axis: HKEnumValue, motorType: HKEnumValue): HKEnumValue;
  HP_Constraint_SetAxisMotorMaxForce(constraint: HP_ConstraintId, axis: HKEnumValue, maxForce: number): HKEnumValue;
  HP_Constraint_SetAxisMotorVelocityTarget(constraint: HP_ConstraintId, axis: HKEnumValue, target: number): HKEnumValue;
  HP_Constraint_GetAppliedImpulses(constraint: HP_ConstraintId): [HKEnumValue, HKVector3, HKVector3];

  HP_World_Create(): [HKEnumValue, HP_WorldId];
  HP_World_Release(world: HP_WorldId): HKEnumValue;
  HP_World_SetGravity(world: HP_WorldId, gravity: HKVector3): HKEnumValue;
  HP_World_AddBody(world: HP_WorldId, body: HP_BodyId, startAsleep: boolean): HKEnumValue;
  HP_World_RemoveBody(world: HP_WorldId, body: HP_BodyId): HKEnumValue;
  HP_World_CastRayWithCollector(
    world: HP_WorldId,
    collector: HP_CollectorId,
    query: [HKVector3, HKVector3, HKFilterInfo, boolean, HP_BodyId]
  ): HKEnumValue;
  HP_World_PointProximityWithCollector(
    world: HP_WorldId,
    collector: HP_CollectorId,
    query: [HKVector3, number, HKFilterInfo, boolean, HP_BodyId]
  ): HKEnumValue;
  HP_World_ShapeProximityWithCollector(
    world: HP_WorldId,
    collector: HP_CollectorId,
    query: [HP_ShapeId, HKVector3, HKQuaternion, number, boolean, HP_BodyId]
  ): HKEnumValue;
  HP_World_ShapeCastWithCollector(
    world: HP_WorldId,
    collector: HP_CollectorId,
    query: [HP_ShapeId, HKQuaternion, HKVector3, HKVector3, boolean, HP_BodyId]
  ): HKEnumValue;
  HP_World_Step(world: HP_WorldId, timestep: number): HKEnumValue;
  HP_World_SetIdealStepTime(world: HP_WorldId, deltaTime: number): HKEnumValue;
  HP_World_SetSpeedLimit(world: HP_WorldId, maxLinearVelocity: number, maxAngularVelocity: number): HKEnumValue;
  HP_World_GetCollisionEvents(world: HP_WorldId): [HKEnumValue, number];
  HP_World_GetNextCollisionEvent(world: HP_WorldId, previousEvent: number): number;
  HP_Event_AsCollision(eventId: number): [HKEnumValue, [HKEnumValue, HKContactPoint, HKContactPoint, number]];
  HP_World_GetTriggerEvents(world: HP_WorldId): [HKEnumValue, number];
  HP_World_GetNextTriggerEvent(world: HP_WorldId, previousEvent: number): number;

  HP_QueryCollector_Create(hitCapacity: number): [HKEnumValue, HP_CollectorId];
  HP_QueryCollector_Release(collector: HP_CollectorId): HKEnumValue;
  HP_QueryCollector_GetNumHits(collector: HP_CollectorId): [HKEnumValue, number];
  HP_QueryCollector_GetCastRayResult(
    collector: HP_CollectorId,
    hitIndex: number
  ): [HKEnumValue, [number, HKContactPoint]];
  HP_QueryCollector_GetPointProximityResult(
    collector: HP_CollectorId,
    hitIndex: number
  ): [HKEnumValue, [number, HKContactPoint]];
  HP_QueryCollector_GetShapeProximityResult(
    collector: HP_CollectorId,
    hitIndex: number
  ): [HKEnumValue, [number, HKContactPoint, HKContactPoint]];
  HP_QueryCollector_GetShapeCastResult(
    collector: HP_CollectorId,
    hitIndex: number
  ): [HKEnumValue, [number, HKContactPoint, HKContactPoint]];
}

/** @internal */
export interface HavokShapeIdentity {
  readonly _id: number;
  readonly _isTrigger: boolean;
  readonly _isSceneQuery: boolean;
}

/** @internal */
export const ZERO_HANDLE: [bigint] = [BigInt(0)];
/** @internal */
export const ZERO_VEC3: HKVector3 = [0, 0, 0];
/** @internal */
export const IDENTITY_QUAT: HKQuaternion = [0, 0, 0, 1];
/** @internal */
export const ALL_FILTER: HKFilterInfo = [0xffffffff, 0xffffffff];

/** @internal Shared leaf-only scratch tuples for synchronous single `HP_*` calls (never held across nested helpers). */
export const SCRATCH_VEC3_A: HKVector3 = [0, 0, 0];
/** @internal */
export const SCRATCH_VEC3_B: HKVector3 = [0, 0, 0];
/** @internal */
export const SCRATCH_VEC3_C: HKVector3 = [0, 0, 0];

/** @internal Write a `Vector3` into an `HKVector3` tuple and return `out`. */
export function writeVec3(src: Vector3, out: HKVector3): HKVector3 {
  out[0] = src.x;
  out[1] = src.y;
  out[2] = src.z;
  return out;
}

/**
 * @internal
 * Normalize `src` into an `HKQuaternion` tuple, falling back to identity `[0, 0, 0, 1]` on zero quaternions.
 */
export function writeNormalizedQuat(src: Quaternion, out: HKQuaternion): void {
  const x = src.x;
  const y = src.y;
  const z = src.z;
  const w = src.w;
  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq > 1e-12) {
    const invLen = 1 / Math.sqrt(lenSq);
    out[0] = x * invLen;
    out[1] = y * invLen;
    out[2] = z * invLen;
    out[3] = w * invLen;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
  }
}

/**
 * @internal
 * Write `pos` and normalized `rot` (falling back to identity on zero quaternion) into an `HKQTransform` tuple.
 */
export function writeQTransform(pos: Vector3, rot: Quaternion, out: [HKVector3, HKQuaternion]): void {
  const p = out[0];
  p[0] = pos.x;
  p[1] = pos.y;
  p[2] = pos.z;
  writeNormalizedQuat(rot, out[1]);
}

/**
 * @internal
 * Normalize `src` into a `Quaternion`, falling back to identity `(0, 0, 0, 1)` on zero quaternions.
 */
export function normalizeQuatOrIdentity(src: Quaternion, out: Quaternion): void {
  const x = src.x;
  const y = src.y;
  const z = src.z;
  const w = src.w;
  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq > 1e-12) {
    const invLen = 1 / Math.sqrt(lenSq);
    out.set(x * invLen, y * invLen, z * invLen, w * invLen);
  } else {
    out.set(0, 0, 0, 1);
  }
}

/** @internal O(1) unordered removal of `item` from a dense array. */
export function swapRemove<T>(arr: T[], item: T): boolean {
  const idx = arr.indexOf(item);
  if (idx === -1) return false;
  const last = arr.length - 1;
  if (idx !== last) {
    arr[idx] = arr[last];
  }
  arr.length = last;
  return true;
}
