import { Component } from "../Component";
import { ICollider } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { UpdateFlag } from "../UpdateFlag";
import { ignoreClone } from "../clone/CloneManager";

export class Collider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _collider: ICollider;

  _updateFlag: UpdateFlag;

  get center(): Vector3 {
    return this._collider.center;
  }

  set center(value: Vector3) {
    this._collider.center = value;
  }

  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._collider.material);
  }

  set material(value: PhysicsMaterial) {
    this._collider.material = value._physicsMaterial;
  }

  get index(): number {
    return this._index;
  }

  setTrigger(value: boolean) {
    this._collider.setTrigger(value);
  }

  setFlag(flag: number, value: boolean) {
    this._collider.setFlag(flag, value);
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
      console.log("changed");
      this._collider.setGlobalPose(this.entity.transform.position, this.entity.transform.rotationQuaternion);
      this._updateFlag.flag = false;
    }
  }
}
