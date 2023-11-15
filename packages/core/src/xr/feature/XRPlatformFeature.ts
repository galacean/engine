import { IXRPlatformFeature, IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine } from "../../Engine";

/**
 * The base class of XR platform feature.
 */
export abstract class XRPlatformFeature implements IXRPlatformFeature {
  constructor(protected _engine: Engine) {}

  /**
   * This method needs to be override.
   */
  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  /**
   * This method needs to be override.
   */
  _initialize(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  /**
   * This method needs to be override.
   */
  _onUpdate(): void {}

  /**
   * This method needs to be override.
   */
  _onDestroy(): void {}

  /**
   * This method needs to be override.
   */
  _onSessionInit(): void {}

  /**
   * This method needs to be override.
   */
  _onSessionStart(): void {}

  /**
   * This method needs to be override.
   */
  _onSessionStop(): void {}

  /**
   * This method needs to be override.
   */
  _onSessionDestroy(): void {}
}
