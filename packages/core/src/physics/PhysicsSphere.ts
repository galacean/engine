import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsSphere } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/** Physics Shape for Sphere */
export class PhysicsSphere extends PhysicsShape {
  _physicsSphere: IPhysicsSphere;

  /** radius of sphere shape */
  get radius(): number {
    return this._physicsSphere.radius;
  }

  set radius(value: number) {
    this._physicsSphere.radius = value;
  }

  constructor(engine: Engine) {
    super();
    this._physicsSphere = engine._physicsEngine.createPhysicsSphere();
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
