import { Component } from "../Component";
import { Entity } from "../Entity";
import { UpdateFlag } from "../UpdateFlag";
import { Collider } from "./Collider";
import { IRigidbody } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export class Rigidbody extends Component {
  /** @internal */
  _rigidBody: IRigidbody;

  _updateFlag: UpdateFlag;

  private _collider: Collider;

  /** The Collider attached */
  get collider(): Collider {
    return this._collider;
  }

  constructor(entity: Entity) {
    super(entity);
    this._rigidBody = this.engine._physicsEngine.createRigidbody();
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  init(
    position: Vector3 = this.entity.transform.position,
    rotation: Quaternion = this.entity.transform.rotationQuaternion
  ) {
    this._rigidBody.init(position, rotation);
  }

  /**
   * attach Collider with Rigidbody
   * @param shape The Collider attached
   * @remark must call after init.
   */
  attachShape(shape: Collider) {
    this._collider = shape;
    this._rigidBody.attachShape(shape._collider);
  }

  onUpdate() {
    if (this._updateFlag.flag) {
      this._rigidBody.setGlobalPose(this.entity.transform.position, this.entity.transform.rotationQuaternion);
      this._updateFlag.flag = false;
    }
  }
}
