import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * PhysX Shape for Box
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  private _halfSize: Vector3 = new Vector3();

  /**
   * Init Box Shape and alloc PhysX objects.
   * @param index index mark Shape
   * @param size size of Shape
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, size: Vector3, material: PhysXPhysicsMaterial) {
    super();

    this._halfSize.setValue(size.x * 0.5, size.y * 0.5, size.z * 0.5);

    // alloc Physx object
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
   * Set size of Box Shape
   * @param value the extents
   */
  setSize(value: Vector3) {
    this._halfSize.setValue(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    const { halfExtents } = this._pxGeometry;
    halfExtents.x = this._halfSize.x * this._scale.x;
    halfExtents.y = this._halfSize.y * this._scale.y;
    halfExtents.z = this._halfSize.z * this._scale.z;

    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * scale of shape
   * @param scale the scale
   */
  setWorldScale(scale: Vector3): void {
    scale.cloneTo(this._scale);
    const { halfExtents } = this._pxGeometry;
    halfExtents.x = this._halfSize.x * this._scale.x;
    halfExtents.y = this._halfSize.y * this._scale.y;
    halfExtents.z = this._halfSize.z * this._scale.z;

    this._pxShape.setGeometry(this._pxGeometry);
  }
}
