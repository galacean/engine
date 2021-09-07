import { Component } from "../Component";
import { ICollider } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsMaterial } from "./PhysicsMaterial";

export class Collider extends Component {
  _collider: ICollider;

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

  getGroup_id(): number {
    return this._collider.getGroup_id();
  }

  setTrigger(value: boolean) {
    this._collider.setTrigger(value);
  }

  setFlag(flag: number, value: boolean) {
    this._collider.setFlag(flag, value);
  }
}
