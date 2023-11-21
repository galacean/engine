import { IHardwareRenderer } from "../renderingHardwareInterface";
import { IXRSession } from "./IXRSession";
import { IXRFeature } from "./feature/IXRFeature";
import { IXRPlatformFeature } from "./feature/IXRPlatformFeature";

/**
 * The interface of XR device.
 */
export interface IXRDevice {
  /**
   * Whether the device is supported.
   * @param mode - The mode of the session.
   */
  isSupportedSessionMode(mode: number): Promise<void>;

  /**
   * Get the platform feature instance of this device
   * @param engine - The engine.
   * @param type - The type of the feature.
   */
  createFeature(type: number): IXRPlatformFeature;

  /**
   * Request a session.
   * @param engine - The engine
   * @param mode - The mode of the session
   * @param requestFeatures - The requested features
   */
  requestSession(rhi: IHardwareRenderer, mode: number, requestFeatures: IXRFeature[]): Promise<IXRSession>;
}
