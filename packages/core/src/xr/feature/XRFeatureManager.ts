import { IXRFeatureDescriptor, IXRFeatureManager, IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../../Engine";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeatureManager<
  TDescriptor extends IXRFeatureDescriptor = IXRFeatureDescriptor,
  TPlatformFeature extends IXRPlatformFeature = IXRPlatformFeature
> implements IXRFeatureManager
{
  _platformFeature: TPlatformFeature;

  protected _descriptor: TDescriptor;
  protected _enabled: boolean = false;

  /**
   * Return the descriptor of the feature.
   */
  get descriptor(): TDescriptor {
    return this._descriptor;
  }

  set descriptor(value: TDescriptor) {
    this._descriptor = value;
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
   * @param descriptor - The descriptor of the feature
   * @returns The promise of the feature
   */
  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return this._platformFeature._isSupported(descriptor || this._descriptor);
  }

  /**
   * Initialize the feature.
   * @returns The promise of the feature
   */
  initialize(): Promise<void> {
    if (this._platformFeature) {
      return this._platformFeature._initialize(this._descriptor);
    } else {
      return Promise.resolve();
    }
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
  onUpdate(): void {
    this._platformFeature?._onUpdate();
  }

  /**
   * Called when the session is initialized.
   */
  onSessionInit(): void {
    this._platformFeature?._onSessionInit();
  }

  /**
   * Called when session starts.
   */
  onSessionStart(): void {
    this._platformFeature?._onSessionStart();
  }

  /**
   * Called when the session is stopped.
   */
  onSessionStop(): void {
    this._platformFeature?._onSessionStop();
  }

  /**
   * Called when the session is destroyed.
   */
  onSessionDestroy(): void {
    this._platformFeature?._onSessionDestroy();
  }

  /**
   * Called when the xr module is destroyed.
   */
  onDestroy(): void {
    this._platformFeature?._onDestroy();
  }

  constructor(protected _engine: Engine) {}
}
