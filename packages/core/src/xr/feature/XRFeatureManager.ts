import { IXRFeatureDescriptor, IXRFeatureManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRPlatformFeature } from "./XRPlatformFeature";

export abstract class XRFeatureManager<
  TDescriptor extends IXRFeatureDescriptor,
  TPlatformFeature extends XRPlatformFeature
> implements IXRFeatureManager
{
  platformFeature: TPlatformFeature;

  protected _engine: Engine;
  protected _descriptor: TDescriptor;
  protected _enabled: boolean = true;

  /**
   * @readonly
   */
  get descriptor(): TDescriptor {
    return this._descriptor;
  }

  set descriptor(value: TDescriptor) {
    this._descriptor = value;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this._enabled = value;
      value ? this._onEnable() : this._onDisable();
    }
  }

  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return this.platformFeature._isSupported(descriptor || this._descriptor);
  }

  initialize(): Promise<void> {
    return this.platformFeature._initialize(this._descriptor);
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
    this.platformFeature._onUpdate();
  }

  /**
   * @internal
   */
  _onSessionInit(): void {
    this.platformFeature._onSessionInit();
  }

  /**
   * @internal
   */
  _onSessionStart(): void {
    this.platformFeature._onSessionStart();
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    this.platformFeature._onSessionStop();
  }

  /**
   * @internal
   */
  _onSessionDestroy(): void {
    this.platformFeature._onSessionDestroy();
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this.platformFeature._onDestroy();
  }
}
