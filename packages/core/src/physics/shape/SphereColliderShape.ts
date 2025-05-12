import { ColliderShape } from "./ColliderShape";
import { ISphereColliderShape } from "@galacean/engine-design";
import { Engine } from "../../Engine";

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
    this._nativeShape = Engine._nativePhysics.createSphereColliderShape(
      this._id,
      this._radius,
      this._material._nativeMaterial
    );
  }

  protected override _syncNative(): void {
    super._syncNative();
    (<ISphereColliderShape>this._nativeShape).setRadius(this._radius);
  }
}
