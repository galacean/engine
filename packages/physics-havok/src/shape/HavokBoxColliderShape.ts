import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IBoxColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId, IDENTITY_QUAT, SCRATCH_VEC3_A, ZERO_HANDLE, ZERO_VEC3 } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_EXTENT = 1e-4;

/**
 * Box collider shape for Havok.
 */
export class HavokBoxColliderShape extends HavokColliderShape implements IBoxColliderShape {
  private _size = new Vector3();
  private _effectiveSize = new Vector3();

  constructor(havokPhysics: HavokPhysics, uniqueID: number, size: Vector3, material: HavokPhysicsMaterial) {
    super(havokPhysics, uniqueID, material);
    this._size.copyFrom(size);
    const fx = Math.fround(Math.abs(size.x) * this._worldScale.x);
    const fy = Math.fround(Math.abs(size.y) * this._worldScale.y);
    const fz = Math.fround(Math.abs(size.z) * this._worldScale.z);
    const ex = fx > 0 && Number.isFinite(fx) ? fx : MIN_EXTENT;
    const ey = fy > 0 && Number.isFinite(fy) ? fy : MIN_EXTENT;
    const ez = fz > 0 && Number.isFinite(fz) ? fz : MIN_EXTENT;
    this._effectiveSize.set(ex, ey, ez);
    const shape = this._createBoxShape(ex, ey, ez);
    if (shape) {
      this._initShape(shape);
    }
  }

  setSize(size: Vector3): void {
    if (this._size.x === size.x && this._size.y === size.y && this._size.z === size.z) {
      return;
    }
    this._size.copyFrom(size);
    this._rebuildIfEffectiveChanged();
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

    const hx = this._effectiveSize.x * 0.5;
    const hy = this._effectiveSize.y * 0.5;
    const hz = this._effectiveSize.z * 0.5;

    const cx = Math.max(-hx, Math.min(hx, localPt.x));
    const cy = Math.max(-hy, Math.min(hy, localPt.y));
    const cz = Math.max(-hz, Math.min(hz, localPt.z));

    const dx = localPt.x - cx;
    const dy = localPt.y - cy;
    const dz = localPt.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    localPt.set(cx, cy, cz);
    Vector3.transformByQuat(localPt, worldRot, localPt);
    localPt.add(worldPos);

    out.set(localPt.x, localPt.y, localPt.z, distSq);
    return out;
  }

  private _rebuildIfEffectiveChanged(): void {
    const fx = Math.fround(Math.abs(this._size.x) * this._worldScale.x);
    const fy = Math.fround(Math.abs(this._size.y) * this._worldScale.y);
    const fz = Math.fround(Math.abs(this._size.z) * this._worldScale.z);
    if (!(fx > 0 && fy > 0 && fz > 0 && Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(fz))) {
      return;
    }
    const eff = this._effectiveSize;
    if (eff.x === fx && eff.y === fy && eff.z === fz) {
      return;
    }
    const shape = this._createBoxShape(fx, fy, fz);
    if (shape) {
      eff.set(fx, fy, fz);
      this._replaceHKShape(shape);
    }
  }

  private _createBoxShape(ex: number, ey: number, ez: number): HP_ShapeId | null {
    const hk = this._havokPhysics._hk;
    const ext = SCRATCH_VEC3_A;
    ext[0] = ex;
    ext[1] = ey;
    ext[2] = ez;
    const [res, shape] = hk.HP_Shape_CreateBox(ZERO_VEC3, IDENTITY_QUAT, ext);
    return res.value === hk.Result.RESULT_OK.value && shape[0] !== ZERO_HANDLE[0] ? shape : null;
  }
}
