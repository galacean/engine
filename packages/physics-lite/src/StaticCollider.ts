import { IStaticCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export class StaticCollider extends Collider implements IStaticCollider {
  /** alloc RigidActor */
  constructor(position: Vector3, rotation: Quaternion) {
    super();
  }
}