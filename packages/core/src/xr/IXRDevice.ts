import { IXRSession, IXRFeatureDescriptor, IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../Engine";
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

  /**
   * Request a session.
   * @param engine - The engine
   * @param mode - The mode of the session
   * @param requestFeatures - The requested features
   */
  requestSession(engine: Engine, mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<IXRSession>;
}
