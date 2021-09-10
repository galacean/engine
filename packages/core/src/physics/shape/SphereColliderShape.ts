import { ColliderShape } from "./ColliderShape";
import { ISphereColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Sphere */
export class SphereColliderShape extends ColliderShape {
  _physicsSphere: ISphereColliderShape;

  /** radius of sphere shape */
  get radius(): number {
    return this._physicsSphere.radius;
  }

  set radius(value: number) {
    this._physicsSphere.radius = value;
  }

  constructor() {
    super();
    this._physicsSphere = PhysicsManager.nativePhysics.createSphereColliderShape();
    this._shape = this._physicsSphere;
  }

  /**
   * init sphere shape and alloc internal physics objects.
   * @param index index of SphereCollider
   * @remarks must call after this component add to Entity.
   */
  init(index: number) {
    this._physicsSphere.initWithRadius(index, this.radius, new Vector3(), new Quaternion());
  }
}
