import { IXRFeatureDescriptor, IXRFeatureManager, IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../../Engine";

/**
 * The base class of XR feature manager.
 */
export abstract class XRFeatureManager<
  TDescriptor extends IXRFeatureDescriptor,
  TPlatformFeature extends IXRPlatformFeature
> implements IXRFeatureManager
{
  protected _engine: Engine;
  protected _descriptor: TDescriptor;
  protected _platformFeature: TPlatformFeature;
  protected _enabled: boolean = true;

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
      value ? this._onEnable() : this._onDisable();
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
    return this._platformFeature._initialize(this._descriptor);
  }

  constructor(engine: Engine) {
    this._engine = engine;
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
  _onUpdate(): void {
    this._platformFeature._onUpdate();
  }

  /**
   * @internal
   */
  _onSessionInit(): void {
    this._platformFeature._onSessionInit();
  }

  /**
   * @internal
   */
  _onSessionStart(): void {
    this._platformFeature._onSessionStart();
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    this._platformFeature._onSessionStop();
  }

  /**
   * @internal
   */
  _onSessionDestroy(): void {
    this._platformFeature._onSessionDestroy();
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._platformFeature._onDestroy();
  }
}
