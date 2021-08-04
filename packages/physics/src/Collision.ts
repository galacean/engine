import { Collider } from "./Collider";
import { Rigidbody } from "./Rigidbody";

export class Collision {
  /** The Collider we hit */
  public readonly collider: Collider;

  constructor(collider: Collider) {
    this.collider = collider;
  }

  get rigidbody(): Rigidbody | undefined {
    return undefined;
  }
}