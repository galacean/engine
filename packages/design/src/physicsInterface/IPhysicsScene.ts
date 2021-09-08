import { Ray, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IPhysicsScene {
  gravity: Vector3;

  addStaticActor(actor: ICollider);

  //--------------simulation ---------------------------------------------------
  simulate(elapsedTime: number, controlSimulation: boolean);

  fetchResults(block: boolean);

  advance();

  fetchCollision(block: boolean);

  collide(elapsedTime: number);

  /**
   * call on every frame to update pose of objects
   */
  update();

  //----------------raycast-----------------------------------------------------
  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param flag - Flag that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, flag: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param flag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, flag: number, outHitResult: Function): Boolean;
}
