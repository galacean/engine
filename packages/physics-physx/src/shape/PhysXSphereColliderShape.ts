import { ISphereColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Sphere collider shape in PhysX.
 */
export class PhysXSphereColliderShape extends PhysXColliderShape implements ISphereColliderShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, radius: number, material: PhysXPhysicsMaterial) {
    super(physXPhysics);

    this._pxGeometry = new physXPhysics._physX.PxSphereGeometry(radius);
    this._initialize(material, uniqueID);
  }

  /**
   * {@inheritDoc ISphereColliderShape.setRadius }
   */
  setRadius(radius: number): void {
    const geometry = this._pxGeometry;
    geometry.radius = radius;
    this._pxShape.setGeometry(geometry);
  }
}
