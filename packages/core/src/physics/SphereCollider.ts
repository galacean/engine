import { ISphereColliderShape } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { Collider } from "./Collider";

/**
 * A sphere-shaped collider.
 */
export class SphereCollider extends Collider {
  private _radius = 1;

  /**
   * The radius of the sphere in the Entity's local space.
   * @defaultValue 1
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (this._radius !== value) {
      this._radius = value;
      const shape = <ISphereColliderShape>this._native;
      if (shape) {
        shape.setRadius(value);
        this._onGeometryChanged();
      }
    }
  }

  protected override _createNative(): ISphereColliderShape {
    const shape = Engine._nativePhysics.createSphereColliderShape(this._id, this._radius, this._getNativeMaterial());
    this._initializeNativeShape(shape);
    return shape;
  }
}
