import { IXRHitResult } from "@galacean/engine-design";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureType } from "../XRFeatureType";
import { IXRHitTestDescriptor } from "./IXRHitTestDescriptor";
import { XRPlatformHitTest } from "./XRPlatformHitTest";

@registerXRFeatureManager(XRFeatureType.HitTest)
/**
 * The manager of XR hit test.
 */
export class XRHitTestManager extends XRFeatureManager<IXRHitTestDescriptor, XRPlatformHitTest> {
  hitTest(x: number, y: number): Promise<IXRHitResult> {
    return this._platformFeature.hitTest(x, y);
  }
}
