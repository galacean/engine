import { Component } from "../Component";
import { Entity } from "../Entity";
import { ColliderFeature } from "./ColliderFeature";

/**
 * Define collider data.
 */
export class Collider extends Component {
  /**
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);
  }

  _onEnable(): void {
    this.scene.findFeature(ColliderFeature).attachCollider(this);
  }

  _onDisable(): void {
    this.scene.findFeature(ColliderFeature).detachCollider(this);
  }
}
