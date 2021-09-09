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
   * @param index index of CapsuleCollider
   * @remarks must call after this component add to Entity.
   */
  init(index: number) {
    this._physicsCapsule.initWithRadiusHeight(index, 1, 2, new Vector3(), new Quaternion());
  }
}
