import { IXRFeature, IXRFeatureDescriptor, IXRFeatureManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";

export abstract class XRFeatureManager implements IXRFeatureManager {
  protected _engine: Engine;
  protected _descriptor: IXRFeatureDescriptor;
  protected _platformFeature: IXRFeature;

  protected _enabled: boolean = true;
  protected _enabledInSession: boolean = false;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this._enabled = value;
      value ? this._onEnable() : this._onDisable();
    }
  }

  constructor(engine: Engine) {
    this._engine = engine;
  }

  initialize(descriptor: IXRFeatureDescriptor): Promise<void> {
    this._descriptor = descriptor;
    const { _engine: engine } = this;
    return new Promise((resolve, reject) => {
      engine.xrModule.xrDevice.createFeature(engine, descriptor).then((feature) => {
        this._platformFeature = feature;
        resolve();
      }, reject);
    });
  }

  /**
   * @internal
   */
  _onEnable(): void {}

  /**
   * @internal
   */
  _onDisable(): void {}

  /**
   * @internal
   */
  _onSessionStart(): void {}

  /**
   * @internal
   */
  _onSessionStop(): void {}

  /**
   * @internal
   */
  _onUpdate(): void {
    this._platformFeature?._onUpdate();
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._platformFeature?._onDestroy();
  }
}
