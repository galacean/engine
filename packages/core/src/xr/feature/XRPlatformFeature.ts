import { IXRPlatformFeature, IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { Logger } from "../../base";

/**
 * The base class of XR platform feature.
 */
export abstract class XRPlatformFeature implements IXRPlatformFeature {
  protected _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  _initialize(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  _onUpdate(): void {
    Logger.warn("This method needs to be override.");
  }

  _onDestroy(): void {
    Logger.warn("This method needs to be override.");
  }

  _onSessionInit(): void {
    Logger.warn("This method needs to be override.");
  }

  _onSessionStart(): void {
    Logger.warn("This method needs to be override.");
  }

  _onSessionStop(): void {
    Logger.warn("This method needs to be override.");
  }

  _onSessionDestroy(): void {
    Logger.warn("This method needs to be override.");
  }
}
