import { SceneFeature } from "../SceneFeature";
import { Collider } from "./Collider";

export class ColliderFeature extends SceneFeature {
  colliders: Collider[];
  constructor() {
    super();

    this.colliders = [];
  }

  /**
   * Add a collider component.
   * @param collider - The collider component to add
   */
  attachCollider(collider: Collider) {
    this.colliders.push(collider);
  }

  /**
   * Remove a collider component.
   * @param collider - The collider component to remove
   */
  detachCollider(collider: Collider) {
    const index = this.colliders.indexOf(collider);
    if (index != -1) {
      this.colliders.splice(index, 1);
    }
  }
}
