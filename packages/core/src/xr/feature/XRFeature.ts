import { Engine } from "../../Engine";
import { IXRFeatureDescriptor } from "../descriptor/IXRFeatureDescriptor";
import { IXRFeatureProvider } from "../interface/IXRFeatureProvider";

export abstract class XRFeature {
  protected _engine: Engine;
  protected _provider: IXRFeatureProvider;
  protected _descriptor: IXRFeatureDescriptor;

  setProvider(provider: IXRFeatureProvider) {
    this._provider = provider;
  }

  /**
   * Enable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onEnable(): void {}

  /**
   * Disable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDisable(): void {}

  /**
   * Update an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onUpdate(): void {}

  /**
   * Destroy an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDestroy(): void {}

  constructor(engine: Engine, descriptor: IXRFeatureDescriptor) {
    this._engine = engine;
    this._descriptor = descriptor;
  }
}
