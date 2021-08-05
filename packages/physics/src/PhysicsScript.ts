import { Script } from "@oasis-engine/core";
import { Collision } from "./Collision";

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
}
