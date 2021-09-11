import { ColliderShape } from "./ColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Plane */
export class PlaneColliderShape extends ColliderShape {
  private readonly _nativePlane: IPlaneColliderShape;

  constructor() {
    super();

    this._nativePlane = PhysicsManager.nativePhysics.createPlaneColliderShape(
      this._id,
      this._material._nativeMaterial,
      this._position,
      this._rotation
    );
    this._nativeShape = this._nativePlane;
  }
}