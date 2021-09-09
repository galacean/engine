import { Component } from "../Component";
import { IDynamicCollider } from "@oasis-engine/design";
import { UpdateFlag } from "../UpdateFlag";
import { Entity } from "../Entity";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysicsShape } from "./PhysicsShape";
import { ignoreClone } from "../clone/CloneManager";

export class DynamicCollider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _collider: IDynamicCollider;

  _updateFlag: UpdateFlag;

  get index(): number {
    return this._index;
  }

  /** The Collider attached */
  get collider(): IDynamicCollider {
    return this._collider;
  }

  constructor(entity: Entity) {
    super(entity);
    this._collider = this.engine._physicsEngine.createDynamicCollider();
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  init(
    position: Vector3 = this.entity.transform.position,
    rotation: Quaternion = this.entity.transform.rotationQuaternion
  ) {
    this._collider.init(position, rotation);
  }

  /**
   * attach Collider with Rigidbody
   * @param shape The Collider attached
   * @remark must call after init.
   */
  attachShape(shape: PhysicsShape) {
    this._collider.attachShape(shape._shape);
  }

  /**
   * @override
   */
  _onEnable() {
    super._onEnable();
    this.engine._componentsManager.addCollider(this);
  }

  /**
   * @override
   */
  _onDisable() {
    super._onDisable();
    this.engine._componentsManager.removeCollider(this);
  }

  onUpdate() {
    if (this._updateFlag.flag) {
      this._collider.setGlobalPose(this.entity.transform.position, this.entity.transform.rotationQuaternion);
      this._updateFlag.flag = false;
    }
  }
}
