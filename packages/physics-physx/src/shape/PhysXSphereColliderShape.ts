import { PhysXPhysics } from "../PhysXPhysics";
import { ISphereColliderShape } from "@oasis-engine/design";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { Vector3 } from "oasis-engine";

/**
 * Sphere collider shape in PhysX.
 */
export class PhysXSphereColliderShape extends PhysXColliderShape implements ISphereColliderShape {
  private _radius: number;
  private _maxScale: number = 1;

  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param uniqueID - UniqueID mark collider
   * @param radius - Size of SphereCollider
   * @param material - Material of PhysXCollider
   */
  constructor(uniqueID: number, radius: number, material: PhysXPhysicsMaterial) {
    super();

    this._radius = radius;

    this._pxGeometry = new PhysXPhysics._physX.PxSphereGeometry(this._radius * this._maxScale);
    this._allocShape(material);
    this._setLocalPose();
    this.setUniqueID(uniqueID);
  }

  /**
   * {@inheritDoc ISphereColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
    this._pxGeometry.radius = value * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    // scale offset
    const position = this._position;
    position.setValue(
      (position.x * scale.x) / this._scale.x,
      (position.y * scale.y) / this._scale.y,
      (position.z * scale.z) / this._scale.z
    );
    this._setLocalPose();

    this._maxScale = Math.max(scale.x, Math.max(scale.x, scale.y));
    this._pxGeometry.radius = this._radius * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
