import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsCapsule } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export class PhysicsCapsule extends PhysicsShape {
  _physicsCapsule: IPhysicsCapsule;

  get radius(): number {
    return this._physicsCapsule.radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   */
  set radius(value: number) {
    this._physicsCapsule.radius = value;
  }

  get height(): number {
    return this._physicsCapsule.height;
  }

  set height(value: number) {
    this._physicsCapsule.height = value;
  }

  constructor(engine: Engine) {
    super();
    this._physicsCapsule = engine._physicsEngine.createPhysicsCapsule();
    this._shape = this._physicsCapsule;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(radius: number, height: number) {
    this._physicsCapsule.initWithRadiusHeight(this._index, radius, height, new Vector3(), new Quaternion());
  }
}
