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
   * The radius in local units. Finite negative values are clamped to 0.
   * @defaultValue 1
   * @remarks The largest absolute world scale component determines the world radius. A zero world radius disables the shape.
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

  protected override _scaleChanged(scale: Vector3): boolean {
    const nativeScale = this._nativeScale;
    return Math.max(scale.x, scale.y, scale.z) !== Math.max(nativeScale.x, nativeScale.y, nativeScale.z);
  }

  protected override _syncGeometry(shape: ISphereColliderShape | null, scale: Vector3): ISphereColliderShape | null {
    const radius = this._radius * Math.max(scale.x, scale.y, scale.z);
    if (!Collider._isValidPositiveFloat32(radius)) {
      return null;
    }
    if (!shape) {
      return Engine._nativePhysics.createSphereColliderShape(this._id, radius, this._getNativeMaterial());
    }
    shape.setRadius(radius);
    return shape;
  }
}
