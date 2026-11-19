import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IBoxColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_EXTENT = 1e-4;

/**
 * Box collider shape for Havok.
 */
export class HavokBoxColliderShape extends HavokColliderShape implements IBoxColliderShape {
  private _size = new Vector3();

  constructor(havokPhysics: HavokPhysics, uniqueID: number, size: Vector3, material: HavokPhysicsMaterial) {
    super(havokPhysics, uniqueID, material);
    this._size.copyFrom(size);
    this._initShape(this._createBoxShape());
  }

  setSize(size: Vector3): void {
    if (this._size.x === size.x && this._size.y === size.y && this._size.z === size.z) {
      return;
    }
    this._size.copyFrom(size);
    this._replaceHKShape(this._createBoxShape());
  }

  protected override _onScaleChanged(): void {
    this._replaceHKShape(this._createBoxShape());
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

    const hx = Math.abs(this._size.x) * this._worldScale.x * 0.5;
    const hy = Math.abs(this._size.y) * this._worldScale.y * 0.5;
    const hz = Math.abs(this._size.z) * this._worldScale.z * 0.5;

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

  private _createBoxShape(): HP_ShapeId {
    const sx = Math.max(Math.abs(this._size.x) * this._worldScale.x, MIN_EXTENT);
    const sy = Math.max(Math.abs(this._size.y) * this._worldScale.y, MIN_EXTENT);
    const sz = Math.max(Math.abs(this._size.z) * this._worldScale.z, MIN_EXTENT);
    return this._havokPhysics._hk.HP_Shape_CreateBox([0, 0, 0], [0, 0, 0, 1], [sx, sy, sz])[1];
  }
}
