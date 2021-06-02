import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
export interface AnimatorControllerLayerMap {
  [key: string]: AnimatorControllerLayer;
}

/**
 * Store the data for Animator playback.
 */
export class AnimatorController {
  private _layers: AnimatorControllerLayer[] = [];

  /** @internal */
  _layersMap: AnimatorControllerLayerMap = {};

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
    this._layersMap[name] = layer;
  }

  /**
   * Remove a layer from the controller.
   * @param layerIndex - The index of the AnimatorLayer
   */
  removeLayer(layerIndex: number): void {
    const theLayer = this.layers[layerIndex];
    this._layers.splice(layerIndex, 1);
    delete this._layersMap[theLayer.name];
  }
}
