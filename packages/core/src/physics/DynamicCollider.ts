import { IDynamicCollider } from "@oasis-engine/design";
import { UpdateFlag } from "../UpdateFlag";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";

export class DynamicCollider extends Collider {
  /** @internal */
  _dynamicCollider: IDynamicCollider;

  _updateFlag: UpdateFlag;

  /** The Collider attached */
  get collider(): IDynamicCollider {
    return this._dynamicCollider;
  }

  constructor(entity: Entity) {
    super(entity);
    this._dynamicCollider = PhysicsManager.nativePhysics.createDynamicCollider();
    this._collider = this._dynamicCollider;
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  onUpdate() {
    if (this._updateFlag.flag) {
      this._dynamicCollider.setGlobalPose(this.entity.transform.position, this.entity.transform.rotationQuaternion);
      this._updateFlag.flag = false;
    }
  }
}
