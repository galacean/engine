import { IXRFeature, IXRFeatureDescriptor, IXRFeatureManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { EnumXRFeatureChangeFlag } from "../enum/EnumXRFeatureChangeFlag";

export abstract class XRFeatureManager implements IXRFeatureManager {
  // @internal
  _platformFeature: IXRFeature;

  protected _engine: Engine;
  protected _descriptor: IXRFeatureDescriptor;
  protected _enabled: boolean = true;

  get descriptor(): IXRFeatureDescriptor {
    return this._descriptor;
  }

  set descriptor(value: IXRFeatureDescriptor) {
    this._descriptor = value;
    this._platformFeature._onFlagChange(EnumXRFeatureChangeFlag.Descriptor, value);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this.enabled !== value) {
      this._enabled = value;
      value ? this._onEnable() : this._onDisable();
      this._platformFeature._onFlagChange(EnumXRFeatureChangeFlag.Enable, value);
    }
  }

  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return this._platformFeature._isSupported(descriptor || this._descriptor);
  }

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
  _onDestroy(): void {
    this._platformFeature._onDestroy();
  }
}
