import { Quaternion, Vector3 } from "@galacean/engine";
import { ICharacterController } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import { HavokMaterialConsumer, HavokPhysicsMaterial } from "./HavokPhysicsMaterial";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import {
  HavokEventBits,
  HavokShapeIdentity,
  HKPhysicsMaterial,
  HKQuaternion,
  HKVector3,
  HP_BodyId,
  HP_ShapeId
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
export class HavokCharacterController implements ICharacterController, HavokMaterialConsumer, HavokShapeIdentity {
  private static _identityQuat: HKQuaternion = [0, 0, 0, 1];
  private static _tempCenter = new Vector3();
  private static _tempSavedCenter = new Vector3();
  private static _tempHoriz = new Vector3();
  private static _tempVec = new Vector3();
  private static _tempRem = new Vector3();
  private static _tempPrevN = new Vector3();
  private static _tempBlockN = new Vector3();
  private static _tempCrease = new Vector3();
  private static _tempQuat = new Quaternion();

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
  _hkShape: HP_ShapeId | null = null;
  /** @internal */
  _collisionLayer = 0;

  private _havokPhysics: HavokPhysics;
  private _material: HavokPhysicsMaterial;
  private _hkSweptShape: HP_ShapeId | null = null;
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
  private _slopeLimitCos = Math.cos((45 * Math.PI) / 180);
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
    if (this._material !== material) {
      this._material._removeConsumer(this);
      this._material = material;
      this._material._addConsumer(this);
    }
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
    const prevX = this._upDirection.x;
    const prevY = this._upDirection.y;
    const prevZ = this._upDirection.z;
    this._upDirection.copyFrom(up);
    if (this._upDirection.lengthSquared() > 1e-12) {
      this._upDirection.normalize();
    } else {
      this._upDirection.set(0, 1, 0);
    }
    if (
      this._hkBody &&
      this._upDirection.x === prevX &&
      this._upDirection.y === prevY &&
      this._upDirection.z === prevZ
    ) {
      return;
    }
    this._updateUpQuaternion();
    if (this._hkBody) {
      this._rebuildShapesInPlace();
    }
  }

  setSlopeLimit(slopeLimit: number): void {
    this._slopeLimitCos = Math.cos((slopeLimit * Math.PI) / 180);
  }

  move(disp: Vector3, minDist: number): number {
    if (!this._scene || !this._hkBody || !this._hkShape || !this._hkSweptShape) {
      return CollisionFlags.None;
    }

    this._scene._flushDirtyColliders();

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

    if (doAutoStep) {
      const savedCenter = HavokCharacterController._tempSavedCenter;
      savedCenter.copyFrom(center);
      const stepLift = this._stepOffset + this._contactOffset;

      // Pass 1 (UP): lift by stepOffset + contactOffset.
      const upVec = HavokCharacterController._tempVec;
      upVec.set(up.x * stepLift, up.y * stepLift, up.z * stepLift);
      const upHit = this._castMove(center, upVec);
      let actualUpLift: number;
      if (upHit) {
        flags |= CollisionFlags.Up;
        actualUpLift = upHit.fraction * stepLift;
      } else {
        actualUpLift = stepLift;
      }
      if (actualUpLift > 0) {
        center.x += up.x * actualUpLift;
        center.y += up.y * actualUpLift;
        center.z += up.z * actualUpLift;
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
            // Auto-step landed on a non-walkable slope: revert and retry without stepping up.
            center.copyFrom(savedCenter);
            flags = depenetrateFlags;
            if (this._moveSide(center, horiz, minStep, true)) {
              flags |= CollisionFlags.Sides;
            }
            if (downDist > MOVE_EPSILON) {
              const fallbackDown = this._moveDown(center, downDist, 0);
              if (fallbackDown.hit) {
                flags |= CollisionFlags.Down;
                this._applyForceSlide(center, fallbackDown);
              }
            }
          } else {
            flags |= CollisionFlags.Down;
            this._applyForceSlide(center, downRes);
          }
        }
      }
    } else {
      // Plain 3-pass UP -> SIDE -> DOWN without auto-step lift.
      if (isMovingUp) {
        const upVec = HavokCharacterController._tempVec;
        upVec.set(up.x * upProj, up.y * upProj, up.z * upProj);
        const upHit = this._castMove(center, upVec);
        if (upHit) {
          flags |= CollisionFlags.Up;
          center.x += upVec.x * upHit.fraction;
          center.y += upVec.y * upHit.fraction;
          center.z += upVec.z * upHit.fraction;
        } else {
          center.add(upVec);
        }
      }

      if (horizLen > minStep) {
        if (this._moveSide(center, horiz, minStep, !isMovingUp)) {
          flags |= CollisionFlags.Sides;
        }
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
      if (!(h.x > 0 && h.y > 0 && h.z > 0)) return false;
      if (this._stepOffset > h.y * 2 + this._contactOffset) return false;
    } else {
      if (!(this._radius > 0 && this._height > 0)) return false;
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
    // Shortest-arc quaternion from +Y (0, 1, 0) to u.
    if (u.y > 1 - 1e-6) {
      this._upQuat = [0, 0, 0, 1];
    } else if (u.y < -1 + 1e-6) {
      // 180-degree rotation around X axis.
      this._upQuat = [1, 0, 0, 0];
    } else {
      // cross((0, 1, 0), u) = (u.z, 0, -u.x), w = 1 + u.y
      const q = HavokCharacterController._tempQuat;
      q.set(u.z, 0, -u.x, 1 + u.y).normalize();
      this._upQuat = [q.x, q.y, q.z, q.w];
    }
  }

  private _createProxyShape(): HP_ShapeId {
    const hk = this._havokPhysics._hk;
    if (this._isBox) {
      const h = this._halfExtents;
      return hk.HP_Shape_CreateBox([0, 0, 0], this._upQuat, [h.x * 2, h.y * 2, h.z * 2])[1];
    }
    const halfH = this._height * 0.5;
    const u = this._upDirection;
    return hk.HP_Shape_CreateCapsule(
      [-u.x * halfH, -u.y * halfH, -u.z * halfH],
      [u.x * halfH, u.y * halfH, u.z * halfH],
      this._radius
    )[1];
  }

  private _createSweptShape(): HP_ShapeId {
    const hk = this._havokPhysics._hk;
    const c = this._contactOffset;
    let shape: HP_ShapeId;
    if (this._isBox) {
      const h = this._halfExtents;
      shape = hk.HP_Shape_CreateBox([0, 0, 0], this._upQuat, [(h.x + c) * 2, (h.y + c) * 2, (h.z + c) * 2])[1];
    } else {
      const halfH = this._height * 0.5;
      const u = this._upDirection;
      shape = hk.HP_Shape_CreateCapsule(
        [-u.x * halfH, -u.y * halfH, -u.z * halfH],
        [u.x * halfH, u.y * halfH, u.z * halfH],
        this._radius + c
      )[1];
    }
    hk.HP_Shape_SetFilterInfo(shape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));
    return shape;
  }

  private _rebuildSweptShape(): void {
    const hk = this._havokPhysics._hk;
    if (this._hkSweptShape) {
      hk.HP_Shape_Release(this._hkSweptShape);
    }
    this._hkSweptShape = this._createSweptShape();
  }

  private _rebuildShapesInPlace(): void {
    if (!this._hkBody || !this._scene) return;
    const hk = this._havokPhysics._hk;
    const oldShape = this._hkShape;

    const newShape = this._createProxyShape();
    hk.HP_Shape_SetMaterial(newShape, this._material._getHKMaterial());
    hk.HP_Shape_SetFilterInfo(newShape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));

    // Re-insert the body so Havok refreshes its broadphase AABB for immediate scene queries.
    hk.HP_World_RemoveBody(this._scene._hkWorld, this._hkBody);
    hk.HP_Body_SetShape(this._hkBody, newShape);
    hk.HP_World_AddBody(this._scene._hkWorld, this._hkBody, false);
    this._scene._removeColliderShape(this._id);
    this._scene._addColliderShape(this._id);

    this._hkShape = newShape;
    this._havokPhysics._registerShapeHandle(newShape[0], this);
    if (oldShape) {
      this._havokPhysics._unregisterShapeHandle(oldShape[0]);
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
    const shape = this._createProxyShape();
    hk.HP_Shape_SetMaterial(shape, this._material._getHKMaterial());
    hk.HP_Shape_SetFilterInfo(shape, this._havokPhysics._getLayerFilterInfo(this._collisionLayer));

    const sweptShape = this._createSweptShape();

    const body = hk.HP_Body_Create()[1];
    hk.HP_Body_SetMotionType(body, hk.MotionType.KINEMATIC);
    hk.HP_Body_SetShape(body, shape);
    hk.HP_Body_SetEventMask(body, HavokEventBits.ALL_TRIGGERS);
    const cx = this._worldPosition.x + this._center.x;
    const cy = this._worldPosition.y + this._center.y;
    const cz = this._worldPosition.z + this._center.z;
    hk.HP_Body_SetQTransform(body, [[cx, cy, cz], HavokCharacterController._identityQuat]);

    this._hkShape = shape;
    this._hkSweptShape = sweptShape;
    this._hkBody = body;
    this._havokPhysics._registerShapeHandle(shape[0], this);
    this._scene._registerControllerBody(this, body);
    hk.HP_World_AddBody(this._scene._hkWorld, body, false);
    this._scene._addColliderShape(this._id);
  }

  private _destroyNative(): void {
    const hk = this._havokPhysics._hk;
    if (this._hkBody && this._scene) {
      this._scene._removeColliderShape(this._id);
      this._scene._unregisterControllerBody(this._hkBody);
      if (hk) {
        hk.HP_World_RemoveBody(this._scene._hkWorld, this._hkBody);
        hk.HP_Body_Release(this._hkBody);
      }
      this._hkBody = null;
    }
    if (this._hkShape) {
      this._havokPhysics._unregisterShapeHandle(this._hkShape[0]);
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
    }
  }

  private _syncProxyTransform(): void {
    if (!this._hkBody) return;
    const cx = this._worldPosition.x + this._center.x;
    const cy = this._worldPosition.y + this._center.y;
    const cz = this._worldPosition.z + this._center.z;
    // Always use SetQTransform (not SetTargetQTransform): Havok's SetTargetQTransform leaves a persistent
    // kinematic velocity across steps, whereas SetQTransform updates transforms without residual velocity
    // and fires trigger enter/exit cleanly on the next world step.
    this._havokPhysics._hk.HP_Body_SetQTransform(this._hkBody, [[cx, cy, cz], HavokCharacterController._identityQuat]);
    this._scene?._markControllerBroadphaseDirty(this);
  }

  private _moveSide(center: Vector3, horizDisp: Vector3, minStep: number, preventNonWalkableClimb: boolean): boolean {
    const up = this._upDirection;
    const rem = HavokCharacterController._tempRem;
    const prevN = HavokCharacterController._tempPrevN;
    const blockN = HavokCharacterController._tempBlockN;
    const crease = HavokCharacterController._tempCrease;

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
        Vector3.cross(prevN, blockN, crease);
        const creaseLenSq = crease.lengthSquared();
        if (creaseLenSq > 1e-10) {
          const proj = Vector3.dot(rem, crease) / creaseLenSq;
          rem.set(crease.x * proj, crease.y * proj, crease.z * proj);
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

    const hit = this._castMove(center, vDisp);
    if (!hit) {
      center.x -= up.x * downDist;
      center.y -= up.y * downDist;
      center.z -= up.z * downDist;
      return { hit: false, walkable: false, remainDist: 0, nx: 0, ny: 0, nz: 0, nDotUp: 0 };
    }

    const traveled = hit.fraction * castDist;
    center.x -= up.x * traveled;
    center.y -= up.y * traveled;
    center.z -= up.z * traveled;

    const nDotUp = hit.nx * up.x + hit.ny * up.y + hit.nz * up.z;
    const walkable = nDotUp > this._slopeLimitCos + SLOPE_EPSILON;
    return {
      hit: true,
      walkable,
      remainDist: Math.max(0, downDist - traveled),
      nx: hit.nx,
      ny: hit.ny,
      nz: hit.nz,
      nDotUp
    };
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
    const hk = this._havokPhysics._hk;
    const scene = this._scene!;
    const col = scene._getMultiCollector();
    const up = this._upDirection;
    let flags = CollisionFlags.None;

    // Iterative EPA refinement: for deep penetrations against large shapes (e.g., plane slabs),
    // stepping near the surface first avoids float32 EPA overshoot and converges to <1e-6 accuracy.
    for (let iter = 0; iter < 4; iter++) {
      const pos: HKVector3 = [center.x, center.y, center.z];
      hk.HP_World_ShapeProximityWithCollector(scene._hkWorld, col, [
        this._hkSweptShape!,
        pos,
        HavokCharacterController._identityQuat,
        0,
        false,
        this._hkBody!
      ]);
      const count = hk.HP_QueryCollector_GetNumHits(col)[1];
      let moved = false;

      for (let i = 0; i < count; i++) {
        const [dist, , hitData] = hk.HP_QueryCollector_GetShapeProximityResult(col, i)[1];
        if (dist < -MOVE_EPSILON) {
          const norm = hitData[4];
          const depth = -dist;
          const step = iter < 2 && depth > 0.01 ? depth - 0.005 : depth;
          const nDotUp = norm[0] * up.x + norm[1] * up.y + norm[2] * up.z;
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
            center.x += norm[0] * step;
            center.y += norm[1] * step;
            center.z += norm[2] * step;
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

    const hk = this._havokPhysics._hk;
    const scene = this._scene!;
    const col = scene._getMultiCollector();
    const start: HKVector3 = [center.x, center.y, center.z];
    const end: HKVector3 = [center.x + disp.x, center.y + disp.y, center.z + disp.z];

    hk.HP_World_ShapeCastWithCollector(scene._hkWorld, col, [
      this._hkSweptShape!,
      HavokCharacterController._identityQuat,
      start,
      end,
      false,
      this._hkBody!
    ]);

    const numHits = hk.HP_QueryCollector_GetNumHits(col)[1];
    let bestFrac = 2;
    let bestNx = 0,
      bestNy = 1,
      bestNz = 0;

    for (let i = 0; i < numHits; i++) {
      const [frac, , hitData] = hk.HP_QueryCollector_GetShapeCastResult(col, i)[1];
      if (frac < 0 || frac >= bestFrac) continue;
      const n = hitData[4];
      // Ignore grazing/backfacing hits at fraction == 0 when moving parallel to or away from the surface.
      if (frac === 0 && disp.x * n[0] + disp.y * n[1] + disp.z * n[2] >= -1e-6) {
        continue;
      }
      bestFrac = frac;
      bestNx = n[0];
      bestNy = n[1];
      bestNz = n[2];
    }

    if (bestFrac > 1) return null;
    return { fraction: bestFrac, nx: bestNx, ny: bestNy, nz: bestNz };
  }
}
