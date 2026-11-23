import { ICapsuleShape, IPhysicsShape, ISphereShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { isValidPositiveFloat32 } from "./float32";
import { CapsuleColliderDirection } from "./enums/CapsuleColliderDirection";

/**
 * A capsule-shaped collider.
 * @remarks The absolute world scale along {@link direction} scales the cylindrical section. The larger scale across
 * the other two axes scales the radius. A cylindrical height at or below zero degenerates to a sphere of the scaled radius.
 */
export class CapsuleCollider extends Collider {
  private _radius = 1;
  private _height = 4;
  private _direction = CapsuleColliderDirection.Y;
  @ignoreClone
  private _nativeIsSphere = false;

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
   * @remarks Values at or below twice the radius degenerate to a sphere of the scaled radius.
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

  protected override _syncGeometry(shape: IPhysicsShape | null, scale: Vector3): IPhysicsShape | null {
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
    if (!isValidPositiveFloat32(radius) || !Number.isFinite(Math.fround(halfHeight))) {
      return null;
    }
    const isSphere = !isValidPositiveFloat32(halfHeight);
    if (isSphere) {
      if (shape && this._nativeIsSphere) {
        (<ISphereShape>shape).setRadius(radius);
        return shape;
      }
      const sphere = Engine._nativePhysics.createSphereShape(this._id, radius, this._getNativeMaterial());
      this._nativeIsSphere = true;
      if (shape) {
        this._replaceNativeShape(this._initializeNativeShape(sphere));
      }
      return sphere;
    }
    if (shape && !this._nativeIsSphere) {
      (<ICapsuleShape>shape).setDimensions(radius, halfHeight, direction);
      return shape;
    }
    const capsule = Engine._nativePhysics.createCapsuleShape(
      this._id,
      radius,
      halfHeight,
      this._getNativeMaterial(),
      direction
    );
    this._nativeIsSphere = false;
    if (shape) {
      this._replaceNativeShape(this._initializeNativeShape(capsule));
    }
    return capsule;
  }
}
