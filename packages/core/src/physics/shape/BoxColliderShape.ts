import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Box */
export class BoxColliderShape extends ColliderShape {
  private _extents: Vector3 = new Vector3(1, 1, 1);

  /** extents of box shape */
  get extents(): Vector3 {
    return this._extents;
  }

  set extents(value: Vector3) {
    (<IBoxColliderShape>this._nativeShape).setExtents(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager.nativePhysics.createBoxColliderShape(
      this._id,
      this._extents,
      this._material._nativeMaterial,
      this._position,
      this._rotation
    );
  }
}
