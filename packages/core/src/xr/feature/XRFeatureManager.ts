import { IXRFeatureDescriptor, IXRFeatureManager, IXRFeature, IXRSession, IXRFrame } from "@galacean/engine-design";
import { Engine } from "../../Engine";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeatureManager<
  TDescriptor extends IXRFeatureDescriptor = IXRFeatureDescriptor,
  TFeature extends IXRFeature = IXRFeature
> implements IXRFeatureManager
{
  _platformFeature: TFeature;

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
    return this._platformFeature.isSupported(descriptor || this._descriptor);
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
