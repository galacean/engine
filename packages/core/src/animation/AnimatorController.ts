import { Entity } from "./../Entity";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
export interface AnimatorControllerParameter {
  name: string;
  value: number | boolean;
}

export class AnimatorController {
  /**
   * The layers in the controller.
   */
  layers: AnimatorControllerLayer[] = [];
  /**
   * TODO: Parameters are used to communicate between scripting and the controller.
   */
  parameters: AnimatorControllerParameter[] = [];
  /**
   * @internal
   */
  _target: Entity;

  /**
   * Add a layer to the controller.
   * @param layer The layer to add.
   */
  addLayer(layer: AnimatorControllerLayer) {
    if (this._target) {
      layer._setTarget(this._target);
    }
    this.layers.push(layer);
  }

  /**
   * Remove a layer from the controller.
   * @param layerIndex The index of the AnimatorLayer.
   */
  removeLayer(layerIndex: number) {
    this.layers.splice(layerIndex, 1);
    this.layers[layerIndex]._destroy();
  }

  /**
   * Add a parameter to the controller.
   * @param paramater The paramater to add.
   */
  addParameter(paramater: AnimatorControllerParameter) {}

  /**
   * Remove a parameter from the controller.
   * @param paramater The paramater to add.
   */
  removeParameter(parameterIndex: number) {}

  /**
   * @internal
   */
  _setTarget(target: Entity) {
    this._target = target;
    const layerCount = this.layers.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.layers[i]._setTarget(target);
    }
  }
}
