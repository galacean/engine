import { Component } from "../Component";
import { IBoxCollider } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";

export class BoxCollider extends Component {
  _boxCollider: IBoxCollider;

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3) {
    this._boxCollider = this.engine._physicsEngine.createBoxCollider();
  }
}
