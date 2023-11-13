import { Engine } from "../Engine";
import { IXRFrame, IXRSession, IXRFeatureDescriptor, IXRPlatformFeature } from "@galacean/engine-design";
import { XRSessionType } from "./session/XRSessionType";

/**
 * The interface of XR device.
 */
export interface IXRDevice {
  /**
   * Whether the device is supported.
   * @param mode - The mode of the session.
   */
  isSupported(mode: XRSessionType): Promise<void>;

  /**
   * Get the platform feature instance of this device
   * @param engine - The engine.
   * @param type - The type of the feature.
   */
  createPlatformFeature(engine: Engine, type: number): IXRPlatformFeature;

  requestSession(engine: Engine, mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<IXRSession>;
}
