import { Component } from "../Component";
import { IBoxCollider } from "@oasis-engine/design/types/physicsInterface";
import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";

export class BoxCollider extends Component {
  _boxCollider: IBoxCollider;

  constructor(entity: Entity) {
    super(entity);
    this._boxCollider = this.engine._physicsEngine.createBoxCollider();
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3) {
    this._boxCollider.initWithSize(value, this.entity.transform.position, this.entity.transform.rotationQuaternion);
  }
}
