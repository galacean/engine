import { PhysXPhysics } from "../PhysXPhysics";
import { ISphereColliderShape } from "@oasis-engine/design";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { Vector3 } from "@oasis-engine/math";

/**
 * PhysX Shape for Sphere
 */
export class PhysXSphereColliderShape extends PhysXColliderShape implements ISphereColliderShape {
  private _radius: number;
  private _maxScale: number = 1;

  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius size of SphereCollider
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, material: PhysXPhysicsMaterial) {
    super();

    this._radius = radius;

    // alloc Physx object
    this._pxGeometry = new PhysXPhysics.PhysX.PxSphereGeometry(this._radius * this._maxScale);
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * Set radius of sphere
   * @param value the radius
   */
  setRadius(value: number) {
    this._radius = value;
    this._pxGeometry.radius = value * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * scale of shape
   * @param scale the scale
   */
  setWorldScale(scale: Vector3): void {
    this._maxScale = Math.max(scale.x, Math.max(scale.x, scale.y));
    this._pxGeometry.radius = this._radius * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
