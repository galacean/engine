import { IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { XRSessionType } from "./session/XRSessionType";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";

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
   * Get the input manager instance of this device
   * @param engine - The engine.
   */
  createInputManager(engine: Engine): XRInputManager;

  /**
   * Get the session manager instance of this device
   * @param engine - The engine.
   */
  createSessionManager(engine: Engine): XRSessionManager;

  /**
   * Get the platform feature instance of this device
   * @param engine - The engine.
   * @param type - The type of the feature.
   */
  createPlatformFeature(engine: Engine, type: number): IXRPlatformFeature;
}
