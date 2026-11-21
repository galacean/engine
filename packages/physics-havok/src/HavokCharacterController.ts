import { MathUtil, Vector3 } from "@galacean/engine";
import { ICharacterController } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import { HavokPhysicsMaterial } from "./HavokPhysicsMaterial";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import {
  HK_EVENT_ALL_TRIGGERS,
  HKPhysicsMaterial,
  HKQuaternion,
  HKVector3,
  HP_BodyId,
  HP_ShapeId,
  IDENTITY_QUAT,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
  ZERO_VEC3
} from "./HavokTypes";

const enum CollisionFlags {
  None = 0,
  Sides = 1,
  Up = 2,
  Down = 4
}

const enum NonWalkableMode {
  PreventClimbing = 0,
  PreventClimbingAndForceSliding = 1
}

const MOVE_EPSILON = 1e-6;
const GROUND_PROBE_EPSILON = 1e-4;
const SLOPE_EPSILON = 1e-5;

interface CastHit {
  fraction: number;
  nx: number;
  ny: number;
  nz: number;
}

interface DownMoveResult {
  hit: boolean;
  walkable: boolean;
  remainDist: number;
  nx: number;
  ny: number;
  nz: number;
  nDotUp: number;
}

/**
 * Kinematic Character Controller for Havok.
 *
 * Uses two Havok shapes:
 * - `_hkShape`: nominal geometry attached to a kinematic proxy body for scene queries, triggers, and material response.
 * - `_hkSweptShape`: collision-skin-inflated geometry (`+ contactOffset`) used by `move()` for overlap recovery and
 *   PhysX-compatible 3-pass (UP -> SIDE -> DOWN) collide-and-slide sweeps.
 */
export class HavokCharacterController implements ICharacterController {
  private static _tempCenter = new Vector3();
  private static _tempSavedCenter = new Vector3();
  private static _tempHoriz = new Vector3();
  private static _tempVec = new Vector3();
  private static _tempRem = new Vector3();
  private static _tempPrevN = new Vector3();
  private static _tempBlockN = new Vector3();

  private static _tempQTransform: [HKVector3, HKQuaternion] = [[0, 0, 0], IDENTITY_QUAT];
  private static _tempCastHit: CastHit = { fraction: 0, nx: 0, ny: 1, nz: 0 };
  private static _tempDownResult: DownMoveResult = {
    hit: false,
    walkable: false,
    remainDist: 0,
    nx: 0,
    ny: 0,
    nz: 0,
    nDotUp: 0
  };

  /** @internal */
  readonly _id: number;
  /** @internal */
  readonly _isTrigger = false;
  /** @internal */
  _isSceneQuery = true;
  /** @internal */
  _scene: HavokPhysicsScene | null = null;
  /** @internal */
  _hkBody: HP_BodyId | null = null;
  /** @internal */
  _hkBodyPtr = 0;
  /** @internal */
  _hkShape: HP_ShapeId | null = null;
  /** @internal */
  _collisionLayer = 0;
  /** @internal */
  _dirtyFlags = 0;

  private _havokPhysics: HavokPhysics;
  private _material: HavokPhysicsMaterial;
  private _hkSweptShape: HP_ShapeId | null = null;
  private _hkSweptShapePtr = 0;
  private _isBox = false;
  private _radius = 0.5;
  private _height = 1;
  private _halfExtents = new Vector3(0.5, 0.5, 0.5);
  private _center = new Vector3();
  private _worldPosition = new Vector3();
  private _contactOffset = 0.02;
  private _stepOffset = 0.5;
  private _nonWalkableMode: number = NonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _upQuat: HKQuaternion = [0, 0, 0, 1];
  private _slopeLimitCos = Math.cos(MathUtil.degreeToRadian(45));
  private _wasGrounded = false;
  private _destroyed = false;

  constructor(havokPhysics: HavokPhysics, uniqueID: number, material: HavokPhysicsMaterial) {
    this._havokPhysics = havokPhysics;
    this._id = uniqueID;
    this._material = material;
    this._material._addConsumer(this);
  }

  /** @internal */
  _applyHKMaterial(mat: HKPhysicsMaterial): void {
    if (this._hkShape) {
      this._havokPhysics._hk.HP_Shape_SetMaterial(this._hkShape, mat);
    }
  }

  /** @internal */
  _addToScene(scene: HavokPhysicsScene): void {
    this._scene = scene;
    this._wasGrounded = false;
    this._createNative();
  }

  /** @internal */
  _removeFromScene(): void {
    this._destroyNative();
    this._wasGrounded = false;
    this._scene = null;
  }

  /** @internal */
  _syncLayerFilter(): void {
    const filterInfo = this._havokPhysics._getLayerFilterInfo(this._collisionLayer);
    const hk = this._havokPhysics._hk;
    if (this._hkSweptShape) {
      hk.HP_Shape_SetFilterInfo(this._hkSweptShape, filterInfo);
    }
    if (this._hkShape) {
      hk.HP_Shape_SetFilterInfo(this._hkShape, filterInfo);
    }
  }

  setCapsule(radius: number, height: number): void {
    if (!this._isBox && this._radius === radius && this._height === height && this._hkBody) {
      return;
    }
    this._isBox = false;
    this._radius = radius;
    this._height = height;
    this._onShapeConfigChanged();
  }

  setBox(halfExtents: Vector3): void {
    if (
      this._isBox &&
      this._halfExtents.x === halfExtents.x &&
      this._halfExtents.y === halfExtents.y &&
      this._halfExtents.z === halfExtents.z &&
      this._hkBody
    ) {
      return;
    }
    this._isBox = true;
    this._halfExtents.copyFrom(halfExtents);
    this._onShapeConfigChanged();
  }

  setCenter(center: Vector3): void {
    this._center.copyFrom(center);
    this._syncProxyTransform();
  }

  setContactOffset(offset: number): void {
    if (this._contactOffset === offset) return;
    this._contactOffset = offset;
    if (!this._hkBody) return;
    if (!this._isValidDescriptor()) {
      this._destroyNative();
    } else {
      this._rebuildSweptShape();
    }
  }

  setMaterial(material: HavokPhysicsMaterial): void {
    if (this._material === material) return;
    this._material._removeConsumer(this);
    this._material = material;
    this._material._addConsumer(this);
    this._applyHKMaterial(material._getHKMaterial());
  }

  setCollisionLayer(layer: number): void {
    if (this._collisionLayer === layer) return;
    this._collisionLayer = layer;
    this._syncLayerFilter();
    if (this._hkShape && this._scene) {
      this._scene._onControllerFilterChanged(this);
    }
  }

  setIsSceneQuery(value: boolean): void {
    this._isSceneQuery = value;
  }

  setWorldPosition(position: Vector3): void {
    this._worldPosition.copyFrom(position);
    this._wasGrounded = false;
    this._syncProxyTransform();
  }

  getWorldPosition(position: Vector3): void {
    position.copyFrom(this._worldPosition);
  }

  setStepOffset(offset: number): void {
    this._stepOffset = offset;
    if (this._hkBody && !this._isValidDescriptor()) {
      this._destroyNative();
    }
  }

  setNonWalkableMode(flag: number): void {
    this._nonWalkableMode = flag;
  }

  setUpDirection(up: Vector3): void {
    if (!Number.isFinite(up.x) || !Number.isFinite(up.y) || !Number.isFinite(up.z)) {
      return;
    }
    const len = Math.hypot(up.x, up.y, up.z);
    if (!(len > 0 && Number.isFinite(len))) {
      return;
    }
    const nx = up.x / len;
    const ny = up.y / len;
    const nz = up.z / len;
    if (this._hkBody && this._upDirection.x === nx && this._upDirection.y === ny && this._upDirection.z === nz) {
      return;
    }
    this._upDirection.set(nx, ny, nz);
    this._updateUpQuaternion();
    if (this._hkBody) {
      this._rebuildShapesInPlace();
    }
  }

  setSlopeLimit(slopeLimit: number): void {
    this._slopeLimitCos = Math.cos(MathUtil.degreeToRadian(slopeLimit));
  }

  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    if (
      !this._scene ||
      !this._hkBody ||
      !this._hkShape ||
      !this._hkSweptShape ||
      !(minDist >= 0 && Number.isFinite(minDist)) ||
      !(elapsedTime >= 0 && Number.isFinite(elapsedTime)) ||
      !Number.isFinite(disp.x) ||
      !Number.isFinite(disp.y) ||
      !Number.isFinite(disp.z)
    ) {
      return CollisionFlags.None;
    }

    // Skip flushing self broadphase since sweeps/depenetration explicitly ignore `this._hkBody`.
    this._scene._flushDirtyColliders(this);

    const up = this._upDirection;
    const center = HavokCharacterController._tempCenter;
    Vector3.add(this._worldPosition, this._center, center);

    // 1. Resolve initial overlap of the collision-skin volume.
    const depenetrateFlags = this._depenetrate(center);
    const recoveredDown = (depenetrateFlags & CollisionFlags.Down) !== 0;

    const upProj = Vector3.dot(disp, up);
    const isMovingUp = upProj > MOVE_EPSILON;
    const downDist = upProj < -MOVE_EPSILON ? -upProj : 0;

    const horiz = HavokCharacterController._tempHoriz;
    horiz.set(disp.x - up.x * upProj, disp.y - up.y * upProj, disp.z - up.z * upProj);
    const horizLen = horiz.length();
    const minStep = Math.max(minDist, MOVE_EPSILON);

    let flags = depenetrateFlags;
    if (isMovingUp) {
      // Moving upward detaches from ground overlap recovery.
      flags &= ~CollisionFlags.Down;
    }

    const doAutoStep =
      (this._wasGrounded || recoveredDown) && !isMovingUp && this._stepOffset > 0 && horizLen > minStep;
    let runStandardPasses = true;

    if (doAutoStep) {
      const savedCenter = HavokCharacterController._tempSavedCenter;
      savedCenter.copyFrom(center);
      const stepLift = this._stepOffset + this._contactOffset;

      // Pass 1 (UP): lift by stepOffset + contactOffset.
      const upRes = this._moveUp(center, stepLift);
      let actualUpLift: number;
      if (upRes >= 0) {
        flags |= CollisionFlags.Up;
        actualUpLift = upRes;
      } else {
        actualUpLift = stepLift;
      }

      // Pass 2 (SIDE): horizontal collide-and-slide at lifted height.
      if (this._moveSide(center, horiz, minStep, true)) {
        flags |= CollisionFlags.Sides;
      }

      // Pass 3 (DOWN): drop back by actualUpLift + downDist (plus tiny probe when downDist == 0).
      const totalDown = actualUpLift + downDist;
      const probeExtra = downDist === 0 && actualUpLift > 0 ? GROUND_PROBE_EPSILON : 0;
      if (totalDown > MOVE_EPSILON) {
        const downRes = this._moveDown(center, totalDown, probeExtra);
        if (downRes.hit) {
          if (actualUpLift > 0 && !downRes.walkable) {
            // Auto-step landed on a non-walkable slope: revert and fall through to standard SIDE -> DOWN.
            center.copyFrom(savedCenter);
            flags = depenetrateFlags;
          } else {
            flags |= CollisionFlags.Down;
            this._applyForceSlide(center, downRes);
            runStandardPasses = false;
          }
        } else {
          runStandardPasses = false;
        }
      } else {
        runStandardPasses = false;
      }
    }

    if (runStandardPasses) {
      // Plain 3-pass UP -> SIDE -> DOWN (or auto-step fallback where isMovingUp is false and horizLen > minStep).
      if (isMovingUp && this._moveUp(center, upProj) >= 0) {
        flags |= CollisionFlags.Up;
      }
      if (horizLen > minStep && this._moveSide(center, horiz, minStep, !isMovingUp)) {
        flags |= CollisionFlags.Sides;
      }
      if (downDist > MOVE_EPSILON) {
        const downRes = this._moveDown(center, downDist, 0);
        if (downRes.hit) {
          flags |= CollisionFlags.Down;
          this._applyForceSlide(center, downRes);
        }
      }
    }

    this._wasGrounded = (flags & CollisionFlags.Down) !== 0;
    Vector3.subtract(center, this._center, this._worldPosition);
    this._syncProxyTransform();
    return flags;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._scene?.removeCharacterController(this);
    this._material._removeConsumer(this);
  }

  private _isValidDescriptor(): boolean {
    if (
      !(this._contactOffset > 0 && Number.isFinite(this._contactOffset)) ||
      !(this._stepOffset >= 0 && Number.isFinite(this._stepOffset))
    ) {
      return false;
    }
    if (this._isBox) {
      const h = this._halfExtents;
      const fx = Math.fround((h.x + this._contactOffset) * 2);
      const fy = Math.fround((h.y + this._contactOffset) * 2);
      const fz = Math.fround((h.z + this._contactOffset) * 2);
      if (!(h.x > 0 && h.y > 0 && h.z > 0 && Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(fz))) {
        return false;
      }
      if (this._stepOffset > h.y * 2 + this._contactOffset) return false;
    } else {
      const fR = Math.fround(this._radius + this._contactOffset);
      const fH = Math.fround(this._height * 0.5);
      if (!(this._radius > 0 && this._height > 0 && Number.isFinite(fR) && Number.isFinite(fH))) {
        return false;
      }
      if (this._stepOffset > this._height + this._radius * 2 + this._contactOffset) return false;
    }
    return true;
  }

  private _onShapeConfigChanged(): void {
    if (!this._scene) return;
    if (!this._isValidDescriptor()) {
      this._destroyNative();
    } else if (!this._hkBody) {
      this._createNative();
    } else {
      this._rebuildShapesInPlace();
    }
  }

  private _updateUpQuaternion(): void {
    const u = this._upDirection;
    const out = this._upQuat;
    // Shortest-arc quaternion from +Y (0, 1, 0) to u.
    if (u.y > 1 - 1e-6) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
    } else if (u.y < -1 + 1e-6) {
      // 180-degree rotation around X axis.
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
    } else {
      // cross((0, 1, 0), u) = (u.z, 0, -u.x), w = 1 + u.y
      const w = 1 + u.y;
      const invLen = 1 / Math.sqrt(u.z * u.z + u.x * u.x + w * w);
      out[0] = u.z * invLen;
      out[1] = 0;
      out[2] = -u.x * invLen;
      out[3] = w * invLen;
    }
  }

  private _createShape(inflation: number): HP_ShapeId {
    const hk = this._havokPhysics._hk;
    if (this._isBox) {
      const h = this._halfExtents;
      const ext = SCRATCH_VEC3_A;
      ext[0] = (h.x + inflation) * 2;
      ext[1] = (h.y + inflation) * 2;
      ext[2] = (h.z + inflation) * 2;
      return hk.HP_Shape_CreateBox(ZERO_VEC3, this._upQuat, ext)[1];
    }
    const halfH = this._height * 0.5;
    const u = this._upDirection;
    const pA = SCRATCH_VEC3_A;
    const pB = SCRATCH_VEC3_B;
    pA[0] = -u.x * halfH;
    pA[1] = -u.y * halfH;
    pA[2] = -u.z * halfH;
    pB[0] = u.x * halfH;
    pB[1] = u.y * halfH;
    pB[2] = u.z * halfH;
    return hk.HP_Shape_CreateCapsule(pA, pB, this._radius + inflation)[1];
  }

  private _createSweptShape(): HP_ShapeId {
    const shape = this._createShape(this._contactOffset);
    this._havokPhysics._hk.HP_Shape_SetFilterInfo(shape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));
    return shape;
  }

  private _rebuildSweptShape(): void {
    const hk = this._havokPhysics._hk;
    if (this._hkSweptShape) {
      hk.HP_Shape_Release(this._hkSweptShape);
    }
    const swept = this._createSweptShape();
    this._hkSweptShape = swept;
    this._hkSweptShapePtr = Number(swept[0]);
  }

  private _rebuildShapesInPlace(): void {
    if (!this._hkBody || !this._scene) return;
    const hk = this._havokPhysics._hk;
    const oldShape = this._hkShape;

    const newShape = this._createShape(0);
    hk.HP_Shape_SetMaterial(newShape, this._material._getHKMaterial());
    hk.HP_Shape_SetFilterInfo(newShape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));

    // Re-insert the body so Havok refreshes its broadphase AABB for immediate scene queries.
    hk.HP_World_RemoveBody(this._scene._hkWorld, this._hkBody);
    hk.HP_Body_SetShape(this._hkBody, newShape);
    hk.HP_World_AddBody(this._scene._hkWorld, this._hkBody, false);
    this._scene._removeColliderShape(this._id);
    this._scene._removedShapeIds.delete(this._id);

    this._hkShape = newShape;
    if (oldShape) {
      hk.HP_Shape_Release(oldShape);
    }

    this._rebuildSweptShape();
  }

  private _createNative(): void {
    if (!this._scene) return;
    if (!this._isValidDescriptor()) {
      console.error("CharacterController: failed to create the controller, check its geometry and stepOffset.");
      return;
    }

    const hk = this._havokPhysics._hk;
    const shape = this._createShape(0);
    hk.HP_Shape_SetMaterial(shape, this._material._getHKMaterial());
    hk.HP_Shape_SetFilterInfo(shape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));

    const sweptShape = this._createSweptShape();

    const body = hk.HP_Body_Create()[1];
    hk.HP_Body_SetMotionType(body, hk.MotionType.KINEMATIC);
    hk.HP_Body_SetShape(body, shape);
    hk.HP_Body_SetEventMask(body, HK_EVENT_ALL_TRIGGERS);
    const qt = HavokCharacterController._tempQTransform;
    qt[0][0] = this._worldPosition.x + this._center.x;
    qt[0][1] = this._worldPosition.y + this._center.y;
    qt[0][2] = this._worldPosition.z + this._center.z;
    hk.HP_Body_SetQTransform(body, qt);

    this._hkShape = shape;
    this._hkSweptShape = sweptShape;
    this._hkSweptShapePtr = Number(sweptShape[0]);
    this._hkBody = body;
    this._hkBodyPtr = Number(body[0]);
    this._scene._bodyToController.set(this._hkBodyPtr, this);
    this._scene._clearControllerDirty(this);
    hk.HP_World_AddBody(this._scene._hkWorld, body, false);
    this._scene._removedShapeIds.delete(this._id);
  }

  private _destroyNative(): void {
    const hk = this._havokPhysics._hk;
    if (this._hkBody && this._scene) {
      this._scene._removeColliderShape(this._id);
      this._scene._bodyToController.delete(this._hkBodyPtr);
      this._scene._clearControllerDirty(this);
      if (hk) {
        hk.HP_World_RemoveBody(this._scene._hkWorld, this._hkBody);
        hk.HP_Body_Release(this._hkBody);
      }
      this._hkBody = null;
      this._hkBodyPtr = 0;
    }
    if (this._hkShape) {
      if (hk) {
        hk.HP_Shape_Release(this._hkShape);
      }
      this._hkShape = null;
    }
    if (this._hkSweptShape) {
      if (hk) {
        hk.HP_Shape_Release(this._hkSweptShape);
      }
      this._hkSweptShape = null;
      this._hkSweptShapePtr = 0;
    }
  }

  private _syncProxyTransform(): void {
    if (!this._hkBody) return;
    const qt = HavokCharacterController._tempQTransform;
    qt[0][0] = this._worldPosition.x + this._center.x;
    qt[0][1] = this._worldPosition.y + this._center.y;
    qt[0][2] = this._worldPosition.z + this._center.z;
    // Always use SetQTransform (not SetTargetQTransform): Havok's SetTargetQTransform leaves a persistent
    // kinematic velocity across steps, whereas SetQTransform updates transforms without residual velocity
    // and fires trigger enter/exit cleanly on the next world step.
    this._havokPhysics._hk.HP_Body_SetQTransform(this._hkBody, qt);
    this._scene?._queueBroadphaseDirtyController(this);
  }

  /** Sweeps along +up by `dist`, advances `center`, and returns actual distance (>= 0) on hit or -1 if unobstructed. */
  private _moveUp(center: Vector3, dist: number): number {
    const up = this._upDirection;
    const upVec = HavokCharacterController._tempVec;
    upVec.set(up.x * dist, up.y * dist, up.z * dist);
    const upHit = this._castMove(center, upVec);
    const actual = upHit ? upHit.fraction * dist : dist;
    if (actual > 0) {
      center.x += up.x * actual;
      center.y += up.y * actual;
      center.z += up.z * actual;
    }
    return upHit ? actual : -1;
  }

  private _moveSide(center: Vector3, horizDisp: Vector3, minStep: number, preventNonWalkableClimb: boolean): boolean {
    const up = this._upDirection;
    const rem = HavokCharacterController._tempRem;
    const prevN = HavokCharacterController._tempPrevN;
    const blockN = HavokCharacterController._tempBlockN;

    rem.copyFrom(horizDisp);
    let hitAny = false;
    let hasPrev = false;

    for (let iter = 0; iter < 4; iter++) {
      const remLen = rem.length();
      if (remLen <= minStep) break;

      const hit = this._castMove(center, rem);
      if (!hit) {
        center.add(rem);
        break;
      }

      hitAny = true;
      if (hit.fraction > 0) {
        center.x += rem.x * hit.fraction;
        center.y += rem.y * hit.fraction;
        center.z += rem.z * hit.fraction;
      }

      rem.scale(1 - hit.fraction);

      const nDotUp = hit.nx * up.x + hit.ny * up.y + hit.nz * up.z;
      const isWalkable = nDotUp > this._slopeLimitCos + SLOPE_EPSILON;

      if (preventNonWalkableClimb && !isWalkable && nDotUp > 0.05) {
        // Treat a non-walkable steep slope as a vertical wall along its horizontal normal while walking.
        const hx = hit.nx - up.x * nDotUp;
        const hy = hit.ny - up.y * nDotUp;
        const hz = hit.nz - up.z * nDotUp;
        const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
        if (hLen > 1e-6) {
          blockN.set(hx / hLen, hy / hLen, hz / hLen);
        } else {
          blockN.set(hit.nx, hit.ny, hit.nz);
        }
      } else {
        blockN.set(hit.nx, hit.ny, hit.nz);
      }

      const into = Vector3.dot(rem, blockN);
      if (into < 0) {
        rem.x -= blockN.x * into;
        rem.y -= blockN.y * into;
        rem.z -= blockN.z * into;
      }

      if (hasPrev && Vector3.dot(rem, prevN) < -1e-6) {
        // Crease between two planes: project remaining displacement along their intersection line.
        const cx = prevN.y * blockN.z - prevN.z * blockN.y;
        const cy = prevN.z * blockN.x - prevN.x * blockN.z;
        const cz = prevN.x * blockN.y - prevN.y * blockN.x;
        const creaseLenSq = cx * cx + cy * cy + cz * cz;
        if (creaseLenSq > 1e-10) {
          const proj = (rem.x * cx + rem.y * cy + rem.z * cz) / creaseLenSq;
          rem.set(cx * proj, cy * proj, cz * proj);
        } else {
          break;
        }
      }

      prevN.copyFrom(blockN);
      hasPrev = true;
    }

    return hitAny;
  }

  private _moveDown(center: Vector3, downDist: number, probeExtra: number): DownMoveResult {
    const up = this._upDirection;
    const castDist = downDist + probeExtra;
    const vDisp = HavokCharacterController._tempVec;
    vDisp.set(-up.x * castDist, -up.y * castDist, -up.z * castDist);

    const out = HavokCharacterController._tempDownResult;
    const hit = this._castMove(center, vDisp);
    if (!hit) {
      center.x -= up.x * downDist;
      center.y -= up.y * downDist;
      center.z -= up.z * downDist;
      out.hit = false;
      out.walkable = false;
      out.remainDist = 0;
      out.nx = 0;
      out.ny = 0;
      out.nz = 0;
      out.nDotUp = 0;
      return out;
    }

    const traveled = hit.fraction * castDist;
    center.x -= up.x * traveled;
    center.y -= up.y * traveled;
    center.z -= up.z * traveled;

    const nDotUp = hit.nx * up.x + hit.ny * up.y + hit.nz * up.z;
    out.hit = true;
    out.walkable = nDotUp > this._slopeLimitCos + SLOPE_EPSILON;
    out.remainDist = Math.max(0, downDist - traveled);
    out.nx = hit.nx;
    out.ny = hit.ny;
    out.nz = hit.nz;
    out.nDotUp = nDotUp;
    return out;
  }

  private _applyForceSlide(center: Vector3, downRes: DownMoveResult): void {
    if (
      this._nonWalkableMode !== NonWalkableMode.PreventClimbingAndForceSliding ||
      downRes.walkable ||
      downRes.nDotUp <= 0.01 ||
      downRes.remainDist <= MOVE_EPSILON
    ) {
      return;
    }

    const up = this._upDirection;
    const rem = HavokCharacterController._tempRem;
    rem.set(-up.x * downRes.remainDist, -up.y * downRes.remainDist, -up.z * downRes.remainDist);

    const into0 = rem.x * downRes.nx + rem.y * downRes.ny + rem.z * downRes.nz;
    if (into0 < 0) {
      rem.x -= downRes.nx * into0;
      rem.y -= downRes.ny * into0;
      rem.z -= downRes.nz * into0;
    }

    for (let iter = 0; iter < 3; iter++) {
      if (rem.lengthSquared() <= MOVE_EPSILON * MOVE_EPSILON) break;
      const sHit = this._castMove(center, rem);
      if (!sHit) {
        center.add(rem);
        break;
      }
      if (sHit.fraction > 0) {
        center.x += rem.x * sHit.fraction;
        center.y += rem.y * sHit.fraction;
        center.z += rem.z * sHit.fraction;
      }
      const sNDotUp = sHit.nx * up.x + sHit.ny * up.y + sHit.nz * up.z;
      if (sNDotUp > this._slopeLimitCos + SLOPE_EPSILON) {
        // Reached a walkable surface; stop force-sliding.
        break;
      }
      rem.scale(1 - sHit.fraction);
      const into = rem.x * sHit.nx + rem.y * sHit.ny + rem.z * sHit.nz;
      if (into < 0) {
        rem.x -= sHit.nx * into;
        rem.y -= sHit.ny * into;
        rem.z -= sHit.nz * into;
      }
    }
  }

  private _depenetrate(center: Vector3): number {
    const scene = this._scene!;
    const up = this._upDirection;
    const norm = HavokCharacterController._tempVec;
    let flags = CollisionFlags.None;

    // Iterative EPA refinement: for deep penetrations against large shapes (e.g., plane slabs),
    // stepping near the surface first avoids float32 EPA overshoot and converges to <1e-6 accuracy.
    for (let iter = 0; iter < 4; iter++) {
      const count = scene._execShapeProx(
        this._hkSweptShape!,
        this._hkSweptShapePtr,
        center.x,
        center.y,
        center.z,
        IDENTITY_QUAT,
        0,
        false,
        this._hkBody!,
        this._hkBodyPtr
      );
      let moved = false;

      for (let i = 0; i < count; i++) {
        const dist = scene._readShapeProximityHitDistAndNormal(i, norm);
        if (dist < -MOVE_EPSILON) {
          const depth = -dist;
          const step = iter < 2 && depth > 0.01 ? depth - 0.005 : depth;
          const nDotUp = norm.x * up.x + norm.y * up.y + norm.z * up.z;
          const walkableFloor = nDotUp > this._slopeLimitCos + SLOPE_EPSILON && nDotUp > 0.5;
          if (walkableFloor) {
            // Resolve walkable-slope overlap strictly along +up so float32 sweep precision does not
            // drift the character backward downhill.
            const upStep = step / nDotUp;
            center.x += up.x * upStep;
            center.y += up.y * upStep;
            center.z += up.z * upStep;
            flags |= CollisionFlags.Down;
          } else {
            center.x += norm.x * step;
            center.y += norm.y * step;
            center.z += norm.z * step;
            if (nDotUp > 0.7) {
              flags |= CollisionFlags.Down;
            } else if (nDotUp < -0.7) {
              flags |= CollisionFlags.Up;
            } else {
              flags |= CollisionFlags.Sides;
            }
          }
          moved = true;
        }
      }

      if (!moved) break;
    }

    return flags;
  }

  private _castMove(center: Vector3, disp: Vector3): CastHit | null {
    if (disp.lengthSquared() <= 1e-16) {
      return null;
    }

    const out = HavokCharacterController._tempCastHit;
    if (
      this._scene!._castShapeForController(
        this._hkSweptShape!,
        this._hkSweptShapePtr,
        center.x,
        center.y,
        center.z,
        disp.x,
        disp.y,
        disp.z,
        this._hkBody!,
        this._hkBodyPtr,
        out
      )
    ) {
      return out;
    }
    return null;
  }
}
