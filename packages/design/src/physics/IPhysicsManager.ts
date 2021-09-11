import { Ray, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IPhysicsManager {
  addCollider(actor: ICollider);

  removeCollider(collider: ICollider): void;

  /**
   * call on every frame to update pose of objects
   */
  update(elapsedTime: number);

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, queryFlag: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(
    ray: Ray,
    distance: number,
    queryFlag: number,
    outHitResult: (colliderShapeID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): Boolean;
}
