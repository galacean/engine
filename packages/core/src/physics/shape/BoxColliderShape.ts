import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";

/**
 * Physical collider shape for box.
 */
export class BoxColliderShape extends ColliderShape {
  private _size: Vector3 = new Vector3(1, 1, 1);
  /**
   * Size of box shape.
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    this._size = value;
    (<IBoxColliderShape>this._nativeShape).setSize(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager._nativePhysics.createBoxColliderShape(
      this._id,
      this._size,
      this._material._nativeMaterial
    );
  }

  /**
   * Set size of box
   * @param x size of x-axis.
   * @param y size of y-axis.
   * @param z size of z-axis.
   */
  setSize(x: number, y: number, z: number) {
    this._size.x = x;
    this._size.y = y;
    this._size.z = z;
    (<IBoxColliderShape>this._nativeShape).setSize(this._size);
  }
}
