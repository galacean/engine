import { Collider } from "./Collider";

export class Collision {
  /** The Collider we hit */
  public readonly collider: Collider;

  constructor(collider: Collider) {
    this.collider = collider;
  }
}