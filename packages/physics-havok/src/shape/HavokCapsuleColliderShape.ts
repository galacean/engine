import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { ICapsuleColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HKVector3, HP_ShapeId } from "../HavokTypes";
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
    this._initShape(this._createCapsuleShape());
  }

  setRadius(radius: number): void {
    if (this._radius === radius) {
      return;
    }
    this._radius = radius;
    this._replaceHKShape(this._createCapsuleShape());
  }

  setHeight(height: number): void {
    if (this._height === height) {
      return;
    }
    this._height = height;
    this._replaceHKShape(this._createCapsuleShape());
  }

  setUpAxis(upAxis: number): void {
    if (this._upAxis === upAxis) {
      return;
    }
    this._upAxis = upAxis as HavokCapsuleUpAxis;
    this._replaceHKShape(this._createCapsuleShape());
  }

  protected override _onScaleChanged(): void {
    this._replaceHKShape(this._createCapsuleShape());
  }

  override pointDistance(point: Vector3): Vector4 {
    const out = HavokColliderShape._tempVector4;
    const worldPos = HavokColliderShape._tempWorldPos;
    const worldRot = HavokColliderShape._tempWorldRot;
    this._getWorldPose(worldPos, worldRot);

    const invRot = HavokColliderShape._tempQuatInv;
    Quaternion.invert(worldRot, invRot);

    const localPt = HavokColliderShape._tempVector3;
    Vector3.subtract(point, worldPos, localPt);
    Vector3.transformByQuat(localPt, invRot, localPt);

    const halfH = this._getScaledHalfHeight();
    const radius = this._getScaledRadius();

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

  private _getScaledRadius(): number {
    const s = this._worldScale;
    let rScale: number;
    switch (this._upAxis) {
      case HavokCapsuleUpAxis.X:
        rScale = Math.max(s.y, s.z);
        break;
      case HavokCapsuleUpAxis.Z:
        rScale = Math.max(s.x, s.y);
        break;
      case HavokCapsuleUpAxis.Y:
      default:
        rScale = Math.max(s.x, s.z);
        break;
    }
    return Math.max(Math.abs(this._radius) * rScale, MIN_DIM);
  }

  private _getScaledHalfHeight(): number {
    const s = this._worldScale;
    let hScale: number;
    switch (this._upAxis) {
      case HavokCapsuleUpAxis.X:
        hScale = s.x;
        break;
      case HavokCapsuleUpAxis.Z:
        hScale = s.z;
        break;
      case HavokCapsuleUpAxis.Y:
      default:
        hScale = s.y;
        break;
    }
    return Math.max(Math.abs(this._height) * 0.5 * hScale, MIN_DIM);
  }

  private _createCapsuleShape(): HP_ShapeId {
    const halfH = this._getScaledHalfHeight();
    const radius = this._getScaledRadius();
    let pointA: HKVector3;
    let pointB: HKVector3;
    switch (this._upAxis) {
      case HavokCapsuleUpAxis.X:
        pointA = [-halfH, 0, 0];
        pointB = [halfH, 0, 0];
        break;
      case HavokCapsuleUpAxis.Z:
        pointA = [0, 0, -halfH];
        pointB = [0, 0, halfH];
        break;
      case HavokCapsuleUpAxis.Y:
      default:
        pointA = [0, -halfH, 0];
        pointB = [0, halfH, 0];
        break;
    }
    return this._havokPhysics._hk.HP_Shape_CreateCapsule(pointA, pointB, radius)[1];
  }
}
