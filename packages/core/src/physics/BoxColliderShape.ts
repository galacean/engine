import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";

/**Physics Shape for Box */
export class BoxColliderShape extends ColliderShape {
  _physicsBox: IBoxColliderShape;

  /** extents of box shape */
  get extents(): Vector3 {
    return this._physicsBox.extents;
  }

  set extents(extents: Vector3) {
    this._physicsBox.extents = extents;
  }

  constructor(engine: Engine) {
    super();
    this._physicsBox = engine._physicsEngine.createBoxColliderShape();
    this._shape = this._physicsBox;
  }

  /**
   * init box shape and alloc internal physics objects.
   * @param index index of Physics Box
   */
  init(index: number) {
    this._physicsBox.initWithSize(index, this.extents, new Vector3(), new Quaternion());
  }
}
