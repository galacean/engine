import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorControllerUpdateMode } from "./enums/AnimatorControllerUpdateMode";

/**
 * Store the data for Animator playback.
 */
export class AnimatorController {
  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();
  private _layers: AnimatorControllerLayer[] = [];
  private _layersMap: Record<string, AnimatorControllerLayer> = {};

  /**
   * The layers in the controller.
   */
  get layers(): Readonly<AnimatorControllerLayer[]> {
    return this._layers;
  }

  /**
   * Get the layer by name.
   * @param name - The layer's name.
   */
  findLayerByName(name: string): AnimatorControllerLayer {
    return this._layersMap[name];
  }

  /**
   * Add a layer to the controller.
   * @param layer - The layer to add
   */
  addLayer(layer: AnimatorControllerLayer): void {
    this._layers.push(layer);
    this._layersMap[layer.name] = layer;
    layer._updateFlagManager.addListener(this._onLayerUpdate);
    this._updateFlagManager.dispatch();
  }

  /**
   * Remove a layer from the controller.
   * @param layerIndex - The index of the AnimatorLayer
   */
  removeLayer(layerIndex: number): void {
    const theLayer = this.layers[layerIndex];
    this._layers.splice(layerIndex, 1);
    delete this._layersMap[theLayer.name];
    theLayer._updateFlagManager.removeListener(this._onLayerUpdate);
    this._updateFlagManager.dispatch();
  }

  /**
   * Clear layers.
   */
  clearLayers(): void {
    this._layers.length = 0;
    for (let name in this._layersMap) {
      delete this._layersMap[name];
    }
    this._updateFlagManager.dispatch();
  }

  /**
   * @internal
   */
  _registerChangeFlag(): BoolUpdateFlag {
    return this._updateFlagManager.createFlag(BoolUpdateFlag);
  }

  /**
   * @internal
   */
  _onLayerUpdate = (type?: number) => {
    if (type === AnimatorControllerUpdateMode.UpdateStateMachine) {
      this._updateFlagManager.dispatch();
    }
  };
}
