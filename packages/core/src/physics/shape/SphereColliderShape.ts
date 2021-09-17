import { ColliderShape } from "./ColliderShape";
import { ISphereColliderShape } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3 } from "@oasis-engine/math";

/**
 * Physical collider shape for sphere.
 */
export class SphereColliderShape extends ColliderShape {
  private _radius: number = 1;

  /**
   * Radius of sphere shape.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    (<ISphereColliderShape>this._nativeShape).setRadius(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager.nativePhysics.createSphereColliderShape(
      this._id,
      this._radius,
      this._material._nativeMaterial
    );
  }

  /**
   * Scale the collider shape
   * @param relativeScale
   */
  scale(relativeScale: Vector3) {
    const maxScale = Math.max(Math.max(relativeScale.x, relativeScale.y), relativeScale.z);
    this._radius *= maxScale;
    (<ISphereColliderShape>this._nativeShape).setRadius(this._radius);
  }
}
