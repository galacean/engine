import { PhysicsShape } from "./PhysicsShape";
import { IPhysicsBox } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";

/**Physics Shape for Box */
export class PhysicsBox extends PhysicsShape {
  _physicsBox: IPhysicsBox;

  /** extents of box shape */
  get extents(): Vector3 {
    return this._physicsBox.extents;
  }

  set extents(extents: Vector3) {
    this._physicsBox.extents = extents;
  }

  constructor(engine: Engine) {
    super();
    this._physicsBox = engine._physicsEngine.createPhysicsBox();
    this._shape = this._physicsBox;
  }

  /**
   * init Box Shape and alloc internal physics objects.
   * @param index index of Physics Box
   */
  init(index: number) {
    this._physicsBox.initWithSize(index, this.extents, new Vector3(), new Quaternion());
  }
}
