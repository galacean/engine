import { IXRFeatureConfig, IXRFeature, IXRPlatformFeature, IXRSession, IXRFrame } from "@galacean/engine-design";
import { Engine } from "../../Engine";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeature<
  TConfig extends IXRFeatureConfig = IXRFeatureConfig,
  TFeature extends IXRPlatformFeature = IXRPlatformFeature
> implements IXRFeature
{
  _platformFeature: TFeature;
  protected _config: TConfig;
  protected _enabled: boolean = false;

  /**
   * Return the descriptor of the feature.
   */
  get config(): TConfig {
    return this._config;
  }

  /**
   * Returns whether the feature is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this._enabled = value;
      value ? this.onEnable() : this.onDisable();
    }
  }

  /**
   * Returns whether the feature is supported.
   * @returns The promise of the feature
   */
  isSupported(): Promise<void> {
    if (this._platformFeature) {
      return this._platformFeature.isSupported(this._config);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Initialize the feature.
   * @returns The promise of the feature
   */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Called when be enabled.
   */
  onEnable(): void {}

  /**
   * Called when be disabled.
   */
  onDisable(): void {}

  /**
   * Called when xr frame is updated.
   */
  onUpdate(session: IXRSession, frame: IXRFrame): void {}

  /**
   * Called when the session is initialized.
   */
  onSessionInit(): void {}

  /**
   * Called when session starts.
   */
  onSessionStart(): void {}

  /**
   * Called when the session is stopped.
   */
  onSessionStop(): void {}

  /**
   * Called when the session is destroyed.
   */
  onSessionDestroy(): void {}

  /**
   * Called when the xr module is destroyed.
   */
  onDestroy(): void {}

  constructor(protected _engine: Engine) {}
}
