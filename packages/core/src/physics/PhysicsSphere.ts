import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsSphere } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export class PhysicsSphere extends PhysicsShape {
  _physicsSphere: IPhysicsSphere;

  get radius(): number {
    return this._physicsSphere.radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   */
  set radius(value: number) {
    this._physicsSphere.radius = value;
  }

  constructor(engine: Engine) {
    super();
    this._physicsSphere = engine._physicsEngine.createPhysicsSphere();
    this._shape = this._physicsSphere;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of SphereCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(value: number) {
    this._physicsSphere.initWithRadius(this._index, value, new Vector3(), new Quaternion());
  }
}
