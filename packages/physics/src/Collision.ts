import { Collider } from "./Collider";
import { Rigidbody } from "./Rigidbody";

export class Collision {
  /** The Collider we hit */
  collider: Collider;
  /** The Rigidbody we hit */
  rigidbody?: Rigidbody;
}
