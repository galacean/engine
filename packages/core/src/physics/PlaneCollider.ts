import { IPlaneCollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Component } from "../Component";
import { UpdateFlag } from "../UpdateFlag";

export class PlaneCollider extends Component {
  _collider: IPlaneCollider;
  _updateFlag: UpdateFlag;
  _index: number = -1;

  get index(): number {
    return this._index;
  }

  /**
   * normal of collider
   * @remarks will re-alloc new PhysX object.
   */
  get normal(): Vector3 {
    return this._collider.normal;
  }

  /**
   * distance of collider
   * @remarks will re-alloc new PhysX object.
   */
  getDistance(): number {
    return this._collider.getDistance();
  }

  /**
   * rotate the normal of plane
   * @param quat new local quaternion
   */
  rotate(quat: Quaternion) {
    // todo
  }

  constructor(entity: Entity) {
    super(entity);
    this._collider = this.engine._physicsEngine.createPlaneCollider();
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  initWithNormalDistance(normal: Vector3, distance: number) {
    this._collider.initWithNormalDistance(
      this._index,
      normal,
      distance,
      this.entity.transform.position,
      this.entity.transform.rotationQuaternion
    );
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

  onUpdate() {}
}
