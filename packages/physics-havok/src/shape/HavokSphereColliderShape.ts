import { Vector3, Vector4 } from "@galacean/engine";
import { ISphereColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_RADIUS = 1e-4;

/**
 * Sphere collider shape for Havok.
 */
export class HavokSphereColliderShape extends HavokColliderShape implements ISphereColliderShape {
  private _radius: number;

  constructor(havokPhysics: HavokPhysics, uniqueID: number, radius: number, material: HavokPhysicsMaterial) {
    super(havokPhysics, uniqueID, material);
    this._radius = radius;
    this._initShape(this._createSphereShape());
  }

  setRadius(radius: number): void {
    if (this._radius === radius) {
      return;
    }
    this._radius = radius;
    this._replaceHKShape(this._createSphereShape());
  }

  protected override _onScaleChanged(): void {
    this._replaceHKShape(this._createSphereShape());
  }

  override pointDistance(point: Vector3): Vector4 {
    const out = HavokColliderShape._tempVector4;
    const worldPos = HavokColliderShape._tempWorldPos;
    const worldRot = HavokColliderShape._tempWorldRot;
    this._getWorldPose(worldPos, worldRot);

    const diff = HavokColliderShape._tempVector3;
    Vector3.subtract(point, worldPos, diff);
    const dist = diff.length();
    const scaledRadius = this._getScaledRadius();

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

  private _createSphereShape(): HP_ShapeId {
    return this._havokPhysics._hk.HP_Shape_CreateSphere([0, 0, 0], this._getScaledRadius())[1];
  }
}
