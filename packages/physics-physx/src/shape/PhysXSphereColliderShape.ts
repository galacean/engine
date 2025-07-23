import { Vector3 } from "@galacean/engine";
import { ISphereColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXSphereGeometry } from "./PhysXSphereGeometry";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Sphere collider shape in PhysX.
 */
export class PhysXSphereColliderShape extends PhysXColliderShape implements ISphereColliderShape {
  protected declare _physXGeometry: PhysXSphereGeometry;

  private _radius: number;
  private _maxScale: number = 1;

  constructor(physXPhysics: PhysXPhysics, uniqueID: number, radius: number, material: PhysXPhysicsMaterial) {
    super(physXPhysics);

    this._radius = radius;
    this._physXGeometry = new PhysXSphereGeometry(physXPhysics._physX, radius * this._maxScale);
    this._pxGeometry = this._physXGeometry.getGeometry();
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc ISphereColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
    this._physXGeometry.radius = value * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);

    this._maxScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    this._physXGeometry.radius = this._radius * this._maxScale;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
