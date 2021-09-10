import { ColliderShape } from "./ColliderShape";
import { ISphereColliderShape } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Sphere */
export class SphereColliderShape extends ColliderShape {
  private _radius: number = 1;
  private readonly _nativeSphere: ISphereColliderShape;

  /** radius of sphere shape */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._nativeSphere.setRadius(value);
  }

  constructor() {
    super();

    this._nativeSphere = PhysicsManager.nativePhysics.createSphereColliderShape(
      this._id,
      this._radius,
      this._material._nativeMaterial,
      this._position,
      this._rotation
    );
    this._nativeShape = this._nativeSphere;
  }
}
