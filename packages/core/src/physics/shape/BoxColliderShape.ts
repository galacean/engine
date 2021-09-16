import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";

/**
 * physical collider shape for box.
 */
export class BoxColliderShape extends ColliderShape {
  private _size: Vector3 = new Vector3(1, 1, 1);

  /** extents of box shape */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    (<IBoxColliderShape>this._nativeShape).setSize(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager.nativePhysics.createBoxColliderShape(
      this._id,
      this._size,
      this._material._nativeMaterial,
      this._position,
      this._rotation
    );
  }
}
