import { Script } from "@oasis-engine/core";
import { Collision } from "./Collision";
import { Collider } from "./Collider";

export class PhysicsScript extends Script {
  /**
   * OnCollisionEnter is called when this collider/rigidbody has begun touching another rigidbody/collider.
   * @param other The Collision data associated with this collision event.
   */
  onCollisionEnter(other: Collision): void {}

  /**
   * OnCollisionStay is called once per frame for every collider/rigidbody that is touching rigidbody/collider.
   * @param other The Collision data associated with this collision event.
   */
  onCollisionStay(other: Collision): void {}

  /**
   * OnCollisionExit is called when this collider/rigidbody has stopped touching another rigidbody/collider.
   * @param other The Collision data associated with this collision event.
   */
  onCollisionExit(other: Collision): void {}

  /**
   * Called when the collision enter.
   * @param other Collider
   */
  onTriggerEnters(other: Collider): void {}

  /**
   * Called when the collision stay.
   * @remarks onTriggerStay is called every frame while the collision stay.
   * @param other Collider
   */
  onTriggerExits(other: Collider): void {}

  /**
   * Called when the collision exit.
   * @param other Collider
   */
  onTriggerStays(other: Collider): void {}
}
