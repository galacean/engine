import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { ICapsuleColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId, SCRATCH_VEC3_A, SCRATCH_VEC3_B, ZERO_HANDLE } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_DIM = 1e-4;

const enum HavokCapsuleUpAxis {
  X = 0,
  Y = 1,
  Z = 2
}

/**
 * Capsule collider shape for Havok.
 */
export class HavokCapsuleColliderShape extends HavokColliderShape implements ICapsuleColliderShape {
  private _radius: number;
  private _height: number;
  private _upAxis: HavokCapsuleUpAxis = HavokCapsuleUpAxis.Y;
  private _effectiveRadius: number;
  private _effectiveHalfH: number;

  constructor(
    havokPhysics: HavokPhysics,
    uniqueID: number,
    radius: number,
    height: number,
    material: HavokPhysicsMaterial
  ) {
    super(havokPhysics, uniqueID, material);
    this._radius = radius;
    this._height = height;
    const fR = this._getScaledRadius();
    const fH = this._getScaledHalfHeight();
    this._effectiveRadius = fR > 0 && Number.isFinite(fR) ? fR : MIN_DIM;
    this._effectiveHalfH = fH > 0 && Number.isFinite(fH) ? fH : MIN_DIM;
    const shape = this._createCapsuleShape(this._effectiveRadius, this._effectiveHalfH);
    if (shape) {
      this._initShape(shape);
    }
  }

  setRadius(radius: number): void {
    if (this._radius === radius) {
      return;
    }
    this._radius = radius;
    this._rebuildIfEffectiveChanged();
  }

  setHeight(height: number): void {
    if (this._height === height) {
      return;
    }
    this._height = height;
    this._rebuildIfEffectiveChanged();
  }

  setUpAxis(upAxis: number): void {
    const nextAxis = upAxis === 0 || upAxis === 2 ? (upAxis as HavokCapsuleUpAxis) : HavokCapsuleUpAxis.Y;
    if (this._upAxis === nextAxis) {
      return;
    }
    this._upAxis = nextAxis;
    this._rebuildIfEffectiveChanged(true);
  }

  protected override _onScaleChanged(): void {
    this._rebuildIfEffectiveChanged();
  }

  override pointDistance(point: Vector3): Vector4 {
    const out = HavokColliderShape._tempVector4;
    const worldPos = HavokColliderShape._tempWorldPos;
    const worldRot = HavokColliderShape._tempWorldRot;
    this._getWorldPose(worldPos, worldRot);

    const invRot = HavokColliderShape._tempQuat;
    Quaternion.invert(worldRot, invRot);

    const localPt = HavokColliderShape._tempVector3;
    Vector3.subtract(point, worldPos, localPt);
    Vector3.transformByQuat(localPt, invRot, localPt);

    const halfH = this._effectiveHalfH;
    const radius = this._effectiveRadius;

    let sx = 0,
      sy = 0,
      sz = 0;
    if (this._upAxis === HavokCapsuleUpAxis.X) {
      sx = Math.max(-halfH, Math.min(halfH, localPt.x));
    } else if (this._upAxis === HavokCapsuleUpAxis.Z) {
      sz = Math.max(-halfH, Math.min(halfH, localPt.z));
    } else {
      sy = Math.max(-halfH, Math.min(halfH, localPt.y));
    }

    const dx = localPt.x - sx;
    const dy = localPt.y - sy;
    const dz = localPt.z - sz;
    const segDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (segDist <= radius) {
      out.set(point.x, point.y, point.z, 0);
      return out;
    }

    const ratio = radius / segDist;
    const surfaceDist = segDist - radius;
    localPt.set(sx + dx * ratio, sy + dy * ratio, sz + dz * ratio);
    Vector3.transformByQuat(localPt, worldRot, localPt);
    localPt.add(worldPos);

    out.set(localPt.x, localPt.y, localPt.z, surfaceDist * surfaceDist);
    return out;
  }

  private _rebuildIfEffectiveChanged(force = false): void {
    const nextR = this._getScaledRadius();
    const nextH = this._getScaledHalfHeight();
    if (
      !(nextR > 0 && Number.isFinite(nextR) && nextH > 0 && Number.isFinite(nextH)) ||
      (!force && nextR === this._effectiveRadius && nextH === this._effectiveHalfH)
    ) {
      return;
    }
    const shape = this._createCapsuleShape(nextR, nextH);
    if (shape) {
      this._effectiveRadius = nextR;
      this._effectiveHalfH = nextH;
      this._replaceHKShape(shape);
    }
  }

  private _getScaledRadius(): number {
    const s = this._worldScale;
    const axis = this._upAxis;
    const rScale =
      axis === HavokCapsuleUpAxis.X
        ? Math.max(s.y, s.z)
        : axis === HavokCapsuleUpAxis.Z
          ? Math.max(s.x, s.y)
          : Math.max(s.x, s.z);
    return Math.fround(Math.abs(this._radius) * rScale);
  }

  private _getScaledHalfHeight(): number {
    const s = this._worldScale;
    const axis = this._upAxis;
    const hScale = axis === HavokCapsuleUpAxis.X ? s.x : axis === HavokCapsuleUpAxis.Z ? s.z : s.y;
    return Math.fround(Math.abs(this._height) * 0.5 * hScale);
  }

  private _createCapsuleShape(radius: number, halfH: number): HP_ShapeId | null {
    const hk = this._havokPhysics._hk;
    const pA = SCRATCH_VEC3_A;
    const pB = SCRATCH_VEC3_B;
    pA[0] = 0;
    pA[1] = 0;
    pA[2] = 0;
    pB[0] = 0;
    pB[1] = 0;
    pB[2] = 0;
    pA[this._upAxis] = -halfH;
    pB[this._upAxis] = halfH;
    const [res, shape] = hk.HP_Shape_CreateCapsule(pA, pB, radius);
    return res.value === hk.Result.RESULT_OK.value && shape[0] !== ZERO_HANDLE[0] ? shape : null;
  }
}
