import { Vector3, Vector4 } from "@galacean/engine";
import { ISphereColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId, ZERO_HANDLE, ZERO_VEC3 } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_RADIUS = 1e-4;

/**
 * Sphere collider shape for Havok.
 */
export class HavokSphereColliderShape extends HavokColliderShape implements ISphereColliderShape {
  private _radius: number;
  private _effectiveRadius: number;

  constructor(havokPhysics: HavokPhysics, uniqueID: number, radius: number, material: HavokPhysicsMaterial) {
    super(havokPhysics, uniqueID, material);
    this._radius = radius;
    const fRadius = this._getScaledRadius();
    this._effectiveRadius = fRadius > 0 && Number.isFinite(fRadius) ? fRadius : MIN_RADIUS;
    const shape = this._createSphereShape(this._effectiveRadius);
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

  protected override _onScaleChanged(): void {
    this._rebuildIfEffectiveChanged();
  }

  override pointDistance(point: Vector3): Vector4 {
    const out = HavokColliderShape._tempVector4;
    const worldPos = HavokColliderShape._tempWorldPos;
    this._getWorldPosition(worldPos);

    const diff = HavokColliderShape._tempVector3;
    Vector3.subtract(point, worldPos, diff);
    const dist = diff.length();
    const scaledRadius = this._effectiveRadius;

    if (dist <= scaledRadius) {
      out.set(point.x, point.y, point.z, 0);
      return out;
    }

    const surfaceDist = dist - scaledRadius;
    const ratio = scaledRadius / dist;
    out.set(
      worldPos.x + diff.x * ratio,
      worldPos.y + diff.y * ratio,
      worldPos.z + diff.z * ratio,
      surfaceDist * surfaceDist
    );
    return out;
  }

  private _rebuildIfEffectiveChanged(): void {
    const nextRadius = this._getScaledRadius();
    if (!(nextRadius > 0 && Number.isFinite(nextRadius)) || nextRadius === this._effectiveRadius) {
      return;
    }
    const shape = this._createSphereShape(nextRadius);
    if (shape) {
      this._effectiveRadius = nextRadius;
      this._replaceHKShape(shape);
    }
  }

  private _getScaledRadius(): number {
    const maxScale = Math.max(this._worldScale.x, this._worldScale.y, this._worldScale.z);
    return Math.fround(Math.abs(this._radius) * maxScale);
  }

  private _createSphereShape(radius: number): HP_ShapeId | null {
    const hk = this._havokPhysics._hk;
    const [res, shape] = hk.HP_Shape_CreateSphere(ZERO_VEC3, radius);
    return res.value === hk.Result.RESULT_OK.value && shape[0] !== ZERO_HANDLE[0] ? shape : null;
  }
}
