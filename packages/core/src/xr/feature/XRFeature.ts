import { IXRFeature, IXRFeatureConfig, IXRPlatformFeature } from "@galacean/engine-design";
import { XRManager } from "../XRManager";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeature<
  TConfig extends IXRFeatureConfig = IXRFeatureConfig,
  TFeature extends IXRPlatformFeature = IXRPlatformFeature
> implements IXRFeature
{
  /** @internal */
  _platformFeature: TFeature;
  protected _enabled: boolean = true;

  /**
   * Returns whether the feature is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this._enabled = value;
      value ? this._onEnable() : this._onDisable();
    }
  }

  /**
   * @internal
   */
  constructor(protected _xrManager: XRManager) {
    this._onEnable();
  }

  /**
   * @internal
   */
  _initialize(): Promise<void> {
    return Promise.resolve();
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
  _onUpdate(): void {}

  /**
   * @internal
   */
  _onSessionInit(): void {}

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
  _onSessionDestroy(): void {}

  /**
   * @internal
   */
  _onDestroy(): void {}

  /**
   * @internal
   * @returns The config of the feature
   */
  _generateConfig(): TConfig {
    throw new Error("Method not implemented.");
  }
}
