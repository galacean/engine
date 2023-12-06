import { IHardwareRenderer } from "../renderingHardwareInterface";
import { IXRSession } from "./IXRSession";
import { IXRPlatformFeature } from "./feature/IXRPlatformFeature";

/**
 * The interface of XR device.
 */
export interface IXRDevice {
  /**
   * Check if the specified session mode is supported.
   * @param mode - The mode of the session.
   */
  isSupportedSessionMode(mode: number): Promise<void>;

  /**
   * Check if the specified feature is supported.
   * @param mode - The type of the feature.
   */
  isSupportedFeature(type: number): boolean;

  /**
   * Get the platform feature instance of this device
   * @param engine - The engine.
   * @param type - The type of the feature.
   */
  createPlatformFeature(type: number, ...args: any[]): IXRPlatformFeature;

  /**
   * Request a session.
   * @param engine - The engine
   * @param mode - The mode of the session
   * @param platformFeatures - The requested platform features
   */
  requestSession(rhi: IHardwareRenderer, mode: number, platformFeatures: IXRPlatformFeature[]): Promise<IXRSession>;
}
