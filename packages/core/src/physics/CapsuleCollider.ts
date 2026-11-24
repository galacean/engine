import { CapsuleColliderDirection, ICapsuleShape, IPhysicsShape, ISphereShape } from "@galacean/engine-design";
import { type BoundingBox, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { setCapsuleBounds } from "./colliderBounds";
import { isValidPositiveFloat32 } from "./float32";

/**
 * A capsule-shaped collider.
 * @remarks The absolute world scale along {@link direction} scales the total height, and the larger scale across
 * the other two axes scales the radius. If the scaled total height is at or below twice the scaled radius, the collider
 * degenerates to a sphere of the scaled radius.
 */
export class CapsuleCollider extends Collider {
  private static readonly _tempDimensions = { radius: 0, halfHeight: 0 };
  private static readonly _tempAxis = new Vector3();

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
   * @remarks If the scaled total height is at or below twice the scaled radius, the collider degenerates to a sphere of the scaled radius.
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
   * @throws When the value is not a valid {@link CapsuleColliderDirection}.
   */
  get direction(): CapsuleColliderDirection {
    return this._direction;
  }

  set direction(value: CapsuleColliderDirection) {
    if (
      value !== CapsuleColliderDirection.X &&
      value !== CapsuleColliderDirection.Y &&
      value !== CapsuleColliderDirection.Z
    ) {
      throw new Error(`Unsupported CapsuleCollider direction: ${value}`);
    }
    if (this._direction !== value) {
      this._direction = value;
      this._geometryDirty = true;
      this._markDirty();
    }
  }

  override getBounds(out: BoundingBox): boolean {
    const transform = this.entity.transform;
    const scale = transform.lossyWorldScale;
    const dimensions = this._getDimensions(Collider._getAbsoluteScale(scale));
    if (!dimensions) {
      return false;
    }
    const direction = this._direction;
    const axis = CapsuleCollider._tempAxis.set(
      direction === CapsuleColliderDirection.X ? 1 : 0,
      direction === CapsuleColliderDirection.Y ? 1 : 0,
      direction === CapsuleColliderDirection.Z ? 1 : 0
    );
    const rotation = transform.worldRotationQuaternion;
    Vector3.transformByQuat(axis, rotation, axis);
    const center = this._getBoundsCenter(transform, scale, rotation);
    return setCapsuleBounds(out, center, axis, dimensions.radius, dimensions.halfHeight);
  }

  protected override _syncGeometry(shape: IPhysicsShape | null, scale: Vector3): IPhysicsShape | null {
    const dimensions = this._getDimensions(scale);
    if (!dimensions) {
      return null;
    }
    const { radius, halfHeight } = dimensions;
    const direction = this._direction;
    if (halfHeight === 0) {
      if (shape && this._nativeIsSphere) {
        (<ISphereShape>shape).setRadius(radius);
        return shape;
      }
      this._nativeIsSphere = true;
      return Engine._nativePhysics.createSphereShape(this._id, radius, this._getNativeMaterial());
    }
    if (shape && !this._nativeIsSphere) {
      (<ICapsuleShape>shape).setDimensions(radius, halfHeight, direction);
      return shape;
    }
    this._nativeIsSphere = false;
    return Engine._nativePhysics.createCapsuleShape(this._id, radius, halfHeight, this._getNativeMaterial(), direction);
  }

  private _getDimensions(scale: Vector3): typeof CapsuleCollider._tempDimensions | null {
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
        return exhaustive;
      }
    }
    const radius = this._radius * radialScale;
    const halfHeight = this._height * heightScale * 0.5 - radius;
    if (!isValidPositiveFloat32(radius) || !Number.isFinite(Math.fround(halfHeight))) {
      return null;
    }
    const dimensions = CapsuleCollider._tempDimensions;
    dimensions.radius = radius;
    dimensions.halfHeight = isValidPositiveFloat32(halfHeight) ? halfHeight : 0;
    return dimensions;
  }
}
