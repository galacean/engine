import { Entity } from "./../Entity";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";

/**
 * Store the data for Animator playback.
 */
export class AnimatorController {
  /** The layers in the controller. */
  layers: AnimatorControllerLayer[] = [];

  /** @internal */
  _target: Entity;

  /**
   * Add a layer to the controller.
   * @param layer - The layer to add
   */
  addLayer(layer: AnimatorControllerLayer): void {
    if (this._target) {
      layer._setTarget(this._target);
    }
    this.layers.push(layer);
  }

  /**
   * Remove a layer from the controller.
   * @param layerIndex - The index of the AnimatorLayer
   */
  removeLayer(layerIndex: number): void {
    this.layers.splice(layerIndex, 1);
    this.layers[layerIndex]._destroy();
  }

  /** @internal */
  _setTarget(target: Entity) {
    this._target = target;
    const layerCount = this.layers.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.layers[i]._setTarget(target);
    }
  }
}
