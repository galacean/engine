import { ICapsuleColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { ColliderShapeUpAxis } from "./enums/ColliderShapeUpAxis";

/**
 * A capsule-shaped collider.
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
   * The height of the cylindrical part, excluding both caps, in the Entity's local space. Finite negative values are clamped to 0.
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

  protected override _hasValidGeometry(scale: Vector3): boolean {
    let worldRadius: number;
    let worldHeight: number;
    switch (this._direction) {
      case ColliderShapeUpAxis.X:
        worldRadius = this._radius * Math.max(scale.y, scale.z);
        worldHeight = this._height * scale.x;
        break;
      case ColliderShapeUpAxis.Y:
        worldRadius = this._radius * Math.max(scale.x, scale.z);
        worldHeight = this._height * scale.y;
        break;
      case ColliderShapeUpAxis.Z:
        worldRadius = this._radius * Math.max(scale.x, scale.y);
        worldHeight = this._height * scale.z;
        break;
    }
    return Collider._isValidPositiveFloat32(worldRadius) && Collider._isValidPositiveFloat32(worldHeight * 0.5);
  }

  protected override _syncGeometry(shape: ICapsuleColliderShape): void {
    shape.setRadius(this._radius);
    shape.setHeight(this._height);
    shape.setUpAxis(this._direction);
  }

  protected override _createNative(): ICapsuleColliderShape {
    const shape = Engine._nativePhysics.createCapsuleColliderShape(
      this._id,
      this._radius,
      this._height,
      this._getNativeMaterial()
    );
    shape.setUpAxis(this._direction);
    this._initializeNativeShape(shape);
    return shape;
  }
}
