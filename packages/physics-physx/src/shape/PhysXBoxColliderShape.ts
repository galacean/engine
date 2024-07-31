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
  /** @internal */
  _halfSize: Vector3 = new Vector3();
  private _sizeScale: Vector3 = new Vector3(1, 1, 1);

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
    const halfSize = this._halfSize;
    const tempExtents = PhysXBoxColliderShape._tempHalfExtents;
    halfSize.set(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    Vector3.multiply(halfSize, this._sizeScale, tempExtents);
    this._pxGeometry.halfExtents = tempExtents;
    this._pxShape.setGeometry(this._pxGeometry);

    this._updateController(tempExtents);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._sizeScale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    const tempExtents = PhysXBoxColliderShape._tempHalfExtents;
    Vector3.multiply(this._halfSize, this._sizeScale, tempExtents);
    this._pxGeometry.halfExtents = tempExtents;
    this._pxShape.setGeometry(this._pxGeometry);

    this._updateController(tempExtents);
  }

  private _updateController(extents: Vector3) {
    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const pxController = controllers.get(i)._pxController;

      if (pxController) {
        pxController.setHalfHeight(extents.x);
        pxController.setHalfSideExtent(extents.y);
        pxController.setHalfForwardExtent(extents.z);
      }
    }
  }
}
