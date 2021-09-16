import { ColliderShape } from "./ColliderShape";
import { ICapsuleColliderShape } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";

/**
 * physical collider shape for capsule.
 */
export class CapsuleColliderShape extends ColliderShape {
  private _radius: number = 1;
  private _height: number = 2;

  /**
   * radius of capsule.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    (<ICapsuleColliderShape>this._nativeShape).setRadius(value);
  }

  /**
   * height of capsule.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    (<ICapsuleColliderShape>this._nativeShape).setHeight(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager.nativePhysics.createCapsuleColliderShape(
      this._id,
      this._radius,
      this._height,
      this._material._nativeMaterial
    );
  }
}
