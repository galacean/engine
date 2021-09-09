import { IPhysicsShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";

export abstract class PhysicsShape {
  /** @internal */
  _shape: IPhysicsShape;

  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._shape.material);
  }

  set material(value: PhysicsMaterial) {
    this._shape.material = value._physicsMaterial;
  }

  setTrigger(value: boolean) {
    this._shape.setTrigger(value);
  }

  setFlag(flag: number, value: boolean) {
    this._shape.setFlag(flag, value);
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param index index of SphereCollider
   * @remarks must call after this component add to Entity.
   */
  abstract init(index: number);
}
