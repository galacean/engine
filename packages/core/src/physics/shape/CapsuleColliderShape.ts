import { ColliderShape } from "./ColliderShape";
import { ICapsuleColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Capsule */
export class CapsuleColliderShape extends ColliderShape {
  _physicsCapsule: ICapsuleColliderShape;

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

  constructor() {
    super();
    this._physicsCapsule = PhysicsManager.nativePhysics.createCapsuleColliderShape();
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
