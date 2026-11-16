import { ICapsuleColliderShape } from "@galacean/engine-design";
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
   * The radius of the capsule in the Entity's local space.
   * @defaultValue 1
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (this._radius !== value) {
      this._radius = value;
      const shape = <ICapsuleColliderShape>this._native;
      if (shape) {
        shape.setRadius(value);
        this._onGeometryChanged();
      }
    }
  }

  /**
   * The height of the cylindrical part, excluding both caps, in the Entity's local space.
   * @defaultValue 2
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      const shape = <ICapsuleColliderShape>this._native;
      if (shape) {
        shape.setHeight(value);
        this._onGeometryChanged();
      }
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
      const shape = <ICapsuleColliderShape>this._native;
      if (shape) {
        shape.setUpAxis(value);
        this._onGeometryChanged();
      }
    }
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
