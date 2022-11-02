import { ColliderShape } from "./ColliderShape";
import { ICapsuleColliderShape } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
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
    this._radius = value;
    (<ICapsuleColliderShape>this._nativeShape).setRadius(value);
  }

  /**
   * Height of capsule.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    (<ICapsuleColliderShape>this._nativeShape).setHeight(value);
  }

  /**
   * Up axis of capsule.
   */
  get upAxis(): ColliderShapeUpAxis {
    return this._upAxis;
  }

  set upAxis(value: ColliderShapeUpAxis) {
    this._upAxis = value;
    (<ICapsuleColliderShape>this._nativeShape).setUpAxis(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager._nativePhysics.createCapsuleColliderShape(
      this._id,
      this._radius,
      this._height,
      this._material._nativeMaterial
    );
  }
}
