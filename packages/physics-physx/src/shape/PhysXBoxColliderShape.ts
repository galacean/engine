import { Vector3 } from "@galacean/engine";
import { IBoxColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Box collider shape in PhysX.
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  private static _tempHalfExtents = new Vector3();
  private _halfSize: Vector3 = new Vector3();

  constructor(physXPhysics: PhysXPhysics, uniqueID: number, size: Vector3, material: PhysXPhysicsMaterial) {
    super(physXPhysics);
    const halfSize = this._halfSize;
    halfSize.set(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this._pxGeometry = new physXPhysics._physX.PxBoxGeometry(halfSize.x, halfSize.y, halfSize.z);
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IBoxColliderShape.setSize }
   */
  setSize(value: Vector3): void {
    this._halfSize.set(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    this._updateGeometry();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._updateGeometry();
  }

  private _updateGeometry(): void {
    const extents = PhysXBoxColliderShape._tempHalfExtents;
    Vector3.multiply(this._halfSize, this._worldScale, extents);
    this._pxGeometry.halfExtents = extents;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
