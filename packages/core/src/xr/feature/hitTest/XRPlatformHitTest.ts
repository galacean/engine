import { XRPlatformFeature } from "../XRPlatformFeature";

export abstract class XRPlatformHitTest extends XRPlatformFeature {
  hitTest(x: number, y: number): Promise<void> {
    return Promise.reject(new Error(""));
  }
}
