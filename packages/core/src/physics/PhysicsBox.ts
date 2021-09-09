import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsBox } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";

export class PhysicsBox extends PhysicsShape {
  _physicsBox: IPhysicsBox;

  get size(): Vector3 {
    return this._physicsBox.size;
  }

  /**
   * set size of collider
   * @param value size of BoxCollider
   */
  set size(value: Vector3) {
    this._physicsBox.size = value;
  }

  constructor(engine: Engine) {
    super();
    this._physicsBox = engine._physicsEngine.createPhysicsBox();
    this._shape = this._physicsBox;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3) {
    this._physicsBox.initWithSize(this._index, value, new Vector3(), new Quaternion());
  }
}
