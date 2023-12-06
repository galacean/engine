import { IXRFeature, IXRPlatformFeature } from "@galacean/engine-design";
import { XRManager } from "../XRManager";
import { XRFeatureType } from "./XRFeatureType";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeature<T extends IXRPlatformFeature = IXRPlatformFeature> implements IXRFeature {
  /** @internal */
  _platformFeature: T;
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
  constructor(
    protected _xrManager: XRManager,
    protected _type: XRFeatureType,
    ...args: any[]
  ) {
    this._platformFeature = <T>_xrManager._platformDevice.createPlatformFeature(_type, ...args);
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
}
