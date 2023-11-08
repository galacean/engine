import { IXRFeatureDescriptor, IXRSessionManager } from "@galacean/engine-design";
import { XRSessionType } from "./XRSessionType";

export abstract class XRSessionManager implements IXRSessionManager {
  /**
   * Return a list of supported frame rates.(only available in-session)
   */
  get supportedFrameRate(): number[] {
    return [];
  }

  /**
   * Return the current frame rate as reported by the device.
   */
  get currentFrameRate(): number {
    return 0;
  }

  /**
   * Initialize the session.
   * @param mode - The mode of the session
   * @param requestFeatures - The requested features
   * @returns The promise of the session
   */
  initialize(mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    return Promise.reject(new Error("This method needs to be override."));
  }

  /**
   * Start the session.
   * @returns The promise of the session
   */
  start(): Promise<void> {
    return Promise.reject(new Error("This method needs to be override."));
  }

  /**
   * Stop the session.
   * @returns The promise of the session
   */
  stop(): Promise<void> {
    return Promise.reject(new Error("This method needs to be override."));
  }

  /**
   * Destroy the session.
   * @returns The promise of the session
   */
  destroy(): Promise<void> {
    return Promise.reject(new Error("This method needs to be override."));
  }
}
