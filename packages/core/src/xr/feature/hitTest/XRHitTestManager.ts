import { IXRHitTest } from "@galacean/engine-design";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureType } from "../XRFeatureType";
import { IXRHitTestDescriptor } from "./IXRHitTestDescriptor";
import { XRPlatformHitTest } from "./XRPlatformHitTest";

@registerXRFeatureManager(XRFeatureType.HitTest)
export class XRHitTestManager extends XRFeatureManager<IXRHitTestDescriptor, XRPlatformHitTest> {
  hitTest(x: number, y: number): Promise<void> {
    // @ts-ignore
    return (<IXRHitTest>this.platformFeature).hitTest(x, y);
  }
}
