import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Box collider shape in PhysX.
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  private static _tempHalfExtents = new Vector3();
  /** @internal */
  _halfSize: Vector3 = new Vector3();

  /**
   * Init Box Shape and alloc PhysX objects.
   * @param uniqueID - UniqueID mark Shape.
   * @param size - Size of Shape.
   * @param material - Material of PhysXCollider.
   */
  constructor(uniqueID: number, size: Vector3, material: PhysXPhysicsMaterial) {
    super();

    this._halfSize.set(size.x * 0.5, size.y * 0.5, size.z * 0.5);

    this._pxGeometry = new PhysXPhysics._physX.PxBoxGeometry(
      this._halfSize.x * this._scale.x,
      this._halfSize.y * this._scale.y,
      this._halfSize.z * this._scale.z
    );
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IBoxColliderShape.setSize }
   */
  setSize(value: Vector3): void {
    this._halfSize.set(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    Vector3.multiply(this._halfSize, this._scale, PhysXBoxColliderShape._tempHalfExtents);
    this._pxGeometry.halfExtents = PhysXBoxColliderShape._tempHalfExtents;
    this._pxShape.setGeometry(this._pxGeometry);

    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const pxController = controllers.get(i)._pxController;
      pxController.setHalfHeight(this._halfSize.x);
      pxController.setHalfSideExtent(this._halfSize.y);
      pxController.setHalfForwardExtent(this._halfSize.z);
    }
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    this._scale.copyFrom(scale);
    this._setLocalPose();

    Vector3.multiply(this._halfSize, this._scale, PhysXBoxColliderShape._tempHalfExtents);
    this._pxGeometry.halfExtents = PhysXBoxColliderShape._tempHalfExtents;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
