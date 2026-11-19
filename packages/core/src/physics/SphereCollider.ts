import { ISphereColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";

/**
 * A sphere-shaped collider.
 */
export class SphereCollider extends Collider {
  private _radius = 1;

  /**
   * The radius of the sphere in the Entity's local space. Finite negative values are clamped to 0.
   * @defaultValue 1
   * @throws When the value is not finite.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("SphereCollider radius must be finite.");
    }
    value = Math.max(0, value);
    if (this._radius !== value) {
      this._radius = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  protected override _hasValidGeometry(scale: Vector3): boolean {
    const radius = this._radius * Math.max(scale.x, scale.y, scale.z);
    return radius > 0 && Number.isFinite(radius);
  }

  protected override _syncGeometry(shape: ISphereColliderShape): void {
    shape.setRadius(this._radius);
  }

  protected override _createNative(): ISphereColliderShape {
    const shape = Engine._nativePhysics.createSphereColliderShape(this._id, this._radius, this._getNativeMaterial());
    this._initializeNativeShape(shape);
    return shape;
  }
}
