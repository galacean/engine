import { IXRFeatureDescriptor, IXRSessionManager } from "@galacean/engine-design";
import { XRSessionType } from "./XRSessionType";

export abstract class XRSessionManager implements IXRSessionManager {
  /**
   * Return a list of supported frame rates (only available in-session!
   */
  get supportedFrameRate(): number[] {
    return [];
  }

  /**
   * Return the current frame rate as reported by the device
   */
  get currentFrameRate(): number {
    return 0;
  }

  initialize(mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }
}
