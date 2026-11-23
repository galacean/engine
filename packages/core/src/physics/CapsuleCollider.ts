import { ICapsuleShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { CapsuleColliderDirection } from "./enums/CapsuleColliderDirection";

/**
 * A capsule-shaped collider.
 * @remarks The absolute world scale along {@link direction} scales the cylindrical section. The larger scale across
 * the other two axes scales the radius. Simulation and queries require both effective dimensions to be positive.
 */
export class CapsuleCollider extends Collider {
  private _radius = 1;
  private _height = 4;
  private _direction = CapsuleColliderDirection.Y;

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
   * The total height in local units, including both caps. Finite negative values are clamped to 0.
   * @defaultValue 4
   * @remarks A height at or below twice the radius excludes the capsule from simulation and queries.
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
   * @defaultValue `CapsuleColliderDirection.Y`
   */
  get direction(): CapsuleColliderDirection {
    return this._direction;
  }

  set direction(value: CapsuleColliderDirection) {
    if (this._direction !== value) {
      this._direction = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  protected override _syncGeometry(shape: ICapsuleShape | null, scale: Vector3): ICapsuleShape | null {
    const direction = this._direction;
    let radialScale: number;
    let heightScale: number;
    switch (direction) {
      case CapsuleColliderDirection.X:
        radialScale = Math.max(scale.y, scale.z);
        heightScale = scale.x;
        break;
      case CapsuleColliderDirection.Y:
        radialScale = Math.max(scale.x, scale.z);
        heightScale = scale.y;
        break;
      case CapsuleColliderDirection.Z:
        radialScale = Math.max(scale.x, scale.y);
        heightScale = scale.z;
        break;
      default: {
        const exhaustive: never = direction;
        throw new Error(`Unsupported CapsuleCollider direction: ${exhaustive}`);
      }
    }
    const radius = this._radius * radialScale;
    const halfHeight = (this._height * 0.5 - this._radius) * heightScale;
    if (!Collider._isValidPositiveFloat32(radius) || !Collider._isValidPositiveFloat32(halfHeight)) {
      return null;
    }
    if (!shape) {
      return Engine._nativePhysics.createCapsuleShape(
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
