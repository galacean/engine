import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface ISphereCollider extends ICollider {
  radius: number;

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of SphereCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(value: number, position: Vector3, rotation: Quaternion): void;
}
