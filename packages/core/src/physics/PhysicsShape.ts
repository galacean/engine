import { IPhysicsShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";

export abstract class PhysicsShape {
  /** @internal */
  _shape: IPhysicsShape;

  /**
   * Physics Material
   */
  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._shape.material);
  }

  set material(value: PhysicsMaterial) {
    this._shape.material = value._physicsMaterial;
  }

  /**
   * Set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  setTrigger(value: boolean) {
    this._shape.setTrigger(value);
  }

  /**
   * Set Scene Query or not
   * @param value true for Query, false for not Query
   */
  setSceneQuery(value: boolean) {
    this._shape.setSceneQuery(value);
  }

  /**
   * Set Shape Flags
   * @param flags Shape Flag
   */
  setFlags(flags: number) {
    this._shape.setFlags(flags);
  }

  /**
   * initialization internal physics shape object
   * @param index index of shape
   */
  abstract init(index: number);
}
