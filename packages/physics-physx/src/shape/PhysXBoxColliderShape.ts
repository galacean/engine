import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * PhysX Shape for Box.
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  private static _tempHalfExtents = {
    x: 0,
    y: 0,
    z: 0
  };
  private _halfSize: Vector3 = new Vector3();

  /**
   * Init Box Shape and alloc PhysX objects.
   * @param index - Index mark Shape.
   * @param size - Size of Shape.
   * @param material - Material of PhysXCollider.
   */
  constructor(index: number, size: Vector3, material: PhysXPhysicsMaterial) {
    super();

    this._halfSize.setValue(size.x * 0.5, size.y * 0.5, size.z * 0.5);

    this._pxGeometry = new PhysXPhysics.PhysX.PxBoxGeometry(
      this._halfSize.x * this._scale.x,
      this._halfSize.y * this._scale.y,
      this._halfSize.z * this._scale.z
    );
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * {@inheritDoc IBoxColliderShape.setSize }
   */
  setSize(value: Vector3) {
    this._halfSize.setValue(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    PhysXBoxColliderShape._tempHalfExtents.x = this._halfSize.x * this._scale.x;
    PhysXBoxColliderShape._tempHalfExtents.y = this._halfSize.y * this._scale.y;
    PhysXBoxColliderShape._tempHalfExtents.z = this._halfSize.z * this._scale.z;

    this._pxGeometry.halfExtents = PhysXBoxColliderShape._tempHalfExtents;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    scale.cloneTo(this._scale);
    PhysXBoxColliderShape._tempHalfExtents.x = this._halfSize.x * this._scale.x;
    PhysXBoxColliderShape._tempHalfExtents.y = this._halfSize.y * this._scale.y;
    PhysXBoxColliderShape._tempHalfExtents.z = this._halfSize.z * this._scale.z;

    this._pxGeometry.halfExtents = PhysXBoxColliderShape._tempHalfExtents;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
