import { ColliderShape } from "./ColliderShape";
import { ISphereColliderShape } from "@galacean/engine-design";
import { PhysicsScene } from "../PhysicsScene";

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
    if (this._radius !== value) {
      this._radius = value;
      (<ISphereColliderShape>this._nativeShape).setRadius(value);
    }
  }

  constructor() {
    super();
    this._nativeShape = PhysicsScene._nativePhysics.createSphereColliderShape(
      this._id,
      this._radius,
      this._material._nativeMaterial
    );
  }

  clone(): SphereColliderShape {
    const dest = new SphereColliderShape();
    this.cloneTo(dest);
    return dest;
  }

  override cloneTo(target: SphereColliderShape) {
    super.cloneTo(target);
    target.radius = this.radius;
  }
}
