import { IColliderShape } from "./IColliderShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**Interface of Physics Shape for Sphere */
export interface ISphereColliderShape extends IColliderShape {
  /** radius of sphere shape */
  radius: number;

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param value size of SphereCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(index: number, value: number, position: Vector3, rotation: Quaternion): void;
}
