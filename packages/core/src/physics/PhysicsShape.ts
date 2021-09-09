import { ignoreClone } from "../clone/CloneManager";
import { IPhysicsShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";

export class PhysicsShape {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _shape: IPhysicsShape;

  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._shape.material);
  }

  set material(value: PhysicsMaterial) {
    this._shape.material = value._physicsMaterial;
  }

  get index(): number {
    return this._index;
  }

  setTrigger(value: boolean) {
    this._shape.setTrigger(value);
  }

  setFlag(flag: number, value: boolean) {
    this._shape.setFlag(flag, value);
  }
}