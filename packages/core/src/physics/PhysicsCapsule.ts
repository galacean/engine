import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsCapsule } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/** Physics Shape for Capsule */
export class PhysicsCapsule extends PhysicsShape {
  _physicsCapsule: IPhysicsCapsule;

  /** radius of capsule */
  get radius(): number {
    return this._physicsCapsule.radius;
  }

  set radius(value: number) {
    this._physicsCapsule.radius = value;
  }

  /** height of capsule */
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
   * init capsule shape and alloc internal physics objects.
   * @param index index of CapsuleCollider
   * @remarks must call after this component add to Entity.
   */
  init(index: number) {
    this._physicsCapsule.initWithRadiusHeight(index, this.radius, this.height, new Vector3(), new Quaternion());
  }
}
