import { Vector3, Vector4 } from "@galacean/engine";
import { ISphereColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId, ZERO_VEC3 } from "../HavokTypes";
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
    this._effectiveRadius = this._getScaledRadius();
    this._initShape(this._createSphereShape(this._effectiveRadius));
  }

  setRadius(radius: number): void {
    if (this._radius === radius) {
      return;
    }
    this._radius = radius;
    const nextRadius = this._getScaledRadius();
    if (nextRadius === this._effectiveRadius) {
      return;
    }
    this._effectiveRadius = nextRadius;
    this._replaceHKShape(this._createSphereShape(nextRadius));
  }

  protected override _onScaleChanged(): void {
    const nextRadius = this._getScaledRadius();
    if (nextRadius === this._effectiveRadius) {
      return;
    }
    this._effectiveRadius = nextRadius;
    this._replaceHKShape(this._createSphereShape(nextRadius));
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

  private _getScaledRadius(): number {
    const maxScale = Math.max(this._worldScale.x, this._worldScale.y, this._worldScale.z);
    return Math.max(Math.abs(this._radius) * maxScale, MIN_RADIUS);
  }

  private _createSphereShape(radius: number): HP_ShapeId {
    return this._havokPhysics._hk.HP_Shape_CreateSphere(ZERO_VEC3, radius)[1];
  }
}
