import { IXRHitResult } from "@galacean/engine-design";
import { XRPlatformFeature } from "../XRPlatformFeature";

/**
 * The base class of XR platform hit test.
 */
export abstract class XRPlatformHitTest extends XRPlatformFeature {
  hitTest(x: number, y: number): Promise<IXRHitResult> {
    return Promise.reject(new Error("Not yet implemented"));
  }
}
