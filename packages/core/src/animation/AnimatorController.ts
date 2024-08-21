import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { AnimatorControllerParameter, AnimatorControllerParameterValue } from "./AnimatorControllerParameter";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { ReferResource } from "../asset/ReferResource";
import { Engine } from "../Engine";

/**
 * Store the data for Animator playback.
 */
export class AnimatorController extends ReferResource {
  /** @internal */
  _parameters: AnimatorControllerParameter[] = [];
  /** @internal */
  _parametersMap: Record<string, AnimatorControllerParameter> = {};
  /** @internal */
  _layers: AnimatorControllerLayer[] = [];
  /** @internal */
  _layersMap: Record<string, AnimatorControllerLayer> = {};

  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The layers in the controller.
   */
  get layers(): Readonly<AnimatorControllerLayer[]> {
    return this._layers;
  }

  /**
   * The parameters in the controller.
   */
  get parameters(): Readonly<AnimatorControllerParameter[]> {
    return this._parameters;
  }

  /**
   * Create an AnimatorController.
   * @param engine - Engine to which the animatorController belongs
   */
  constructor(engine: Engine);

  /**
   * @deprecated
   */
  constructor();

  constructor(engine?: Engine) {
    engine && super(engine);
  }

  /**
   * Add a parameter to the controller.
   * @param name - The name of the parameter
   * @param defaultValue - The default value of the parameter
   * @param isTrigger - Is the parameter a trigger, if true, the parameter will act as a trigger, trigger work mostly like bool parameter, but their values are reset to false after check a Transition.
   */
  addParameter(
    name: string,
    defaultValue?: AnimatorControllerParameterValue,
    isTrigger: boolean = false
  ): AnimatorControllerParameter {
    if (this._parametersMap[name]) {
      console.warn(`Parameter ${name} already exists.`);
      return null;
    }
    const param = new AnimatorControllerParameter();
    param.name = name;
    param.defaultValue = defaultValue;
    param._isTrigger = isTrigger;
    param._onNameChanged = (oldName, newName) => {
      delete this._parametersMap[oldName];
      this._parametersMap[newName] = param as AnimatorControllerParameter;
    };
    this._parametersMap[name] = param;
    this._parameters.push(param);
    return param;
  }

  /**
   * Remove a parameter from the controller by name.
   * @param name - The parameter name
   */
  removeParameter(name: string) {
    const parameter = this._parametersMap[name];
    const index = this._parameters.indexOf(parameter);
    if (index !== -1) {
      this._parameters.splice(index, 1);
      delete this._parametersMap[parameter.name];
    }
  }

  /**
   * Clear parameters.
   */
  clearParameters(): void {
    this._parameters.length = 0;
    for (let name in this._parametersMap) {
      delete this._parametersMap[name];
    }
  }

  /**
   * Get the parameter by name.
   * @param name - The name of the parameter
   */
  getParameter(name: string): AnimatorControllerParameter {
    return this._parametersMap[name] || null;
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
}
