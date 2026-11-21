import { ICapsuleColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { ColliderShapeUpAxis } from "./enums/ColliderShapeUpAxis";

/**
 * A capsule-shaped collider.
 * @remarks The absolute world scale along {@link direction} scales the height. The larger scale across the other two
 * axes scales the radius. Simulation and queries require both effective dimensions to be positive.
 */
export class CapsuleCollider extends Collider {
  private _radius = 1;
  private _height = 2;
  private _direction = ColliderShapeUpAxis.Y;

  /**
   * The radius of the capsule in the Entity's local space. Finite negative values are clamped to 0.
   * @defaultValue 1
   * @throws When the value is not finite.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("CapsuleCollider radius must be finite.");
    }
    value = Math.max(0, value);
    if (this._radius !== value) {
      this._radius = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  /**
   * The cylinder height in local units, excluding both caps. Finite negative values are clamped to 0.
   * @defaultValue 2
   * @throws When the value is not finite.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("CapsuleCollider height must be finite.");
    }
    value = Math.max(0, value);
    if (this._height !== value) {
      this._height = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  /**
   * The local axis the capsule is aligned with.
   * @defaultValue `ColliderShapeUpAxis.Y`
   */
  get direction(): ColliderShapeUpAxis {
    return this._direction;
  }

  set direction(value: ColliderShapeUpAxis) {
    if (this._direction !== value) {
      this._direction = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  protected override _syncGeometry(shape: ICapsuleColliderShape | null, scale: Vector3): ICapsuleColliderShape | null {
    const direction = this._direction;
    let radialScale: number;
    let heightScale: number;
    switch (direction) {
      case ColliderShapeUpAxis.X:
        radialScale = Math.max(scale.y, scale.z);
        heightScale = scale.x;
        break;
      case ColliderShapeUpAxis.Y:
        radialScale = Math.max(scale.x, scale.z);
        heightScale = scale.y;
        break;
      case ColliderShapeUpAxis.Z:
        radialScale = Math.max(scale.x, scale.y);
        heightScale = scale.z;
        break;
    }
    const radius = this._radius * radialScale;
    const halfHeight = this._height * heightScale * 0.5;
    if (!Collider._isValidPositiveFloat32(radius) || !Collider._isValidPositiveFloat32(halfHeight)) {
      return null;
    }
    if (!shape) {
      return Engine._nativePhysics.createCapsuleColliderShape(
        this._id,
        radius,
        halfHeight,
        this._getNativeMaterial(),
        direction
      );
    }
    shape.setDimensions(radius, halfHeight, direction);
    return shape;
  }
}
