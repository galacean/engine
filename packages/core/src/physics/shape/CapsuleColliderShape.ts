import { ColliderShape } from "./ColliderShape";
import { ICapsuleColliderShape } from "@galacean/engine-design";
import { PhysicsScene } from "../PhysicsScene";
import { ColliderShapeUpAxis } from "../enums/ColliderShapeUpAxis";

/**
 * Physical collider shape for capsule.
 */
export class CapsuleColliderShape extends ColliderShape {
  private _radius: number = 1;
  private _height: number = 2;
  private _upAxis: ColliderShapeUpAxis = ColliderShapeUpAxis.Y;

  /**
   * Radius of capsule.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (this._radius !== value) {
      this._radius = value;
      (<ICapsuleColliderShape>this._nativeShape).setRadius(value);
    }
  }

  /**
   * Height of capsule.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      (<ICapsuleColliderShape>this._nativeShape).setHeight(value);
    }
  }

  /**
   * Up axis of capsule.
   */
  get upAxis(): ColliderShapeUpAxis {
    return this._upAxis;
  }

  set upAxis(value: ColliderShapeUpAxis) {
    if (this._upAxis !== value) {
      this._upAxis = value;
      (<ICapsuleColliderShape>this._nativeShape).setUpAxis(value);
    }
  }

  constructor() {
    super();
    this._nativeShape = PhysicsScene._nativePhysics.createCapsuleColliderShape(
      this._id,
      this._radius,
      this._height,
      this._material._nativeMaterial
    );
  }
}
