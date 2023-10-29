import { IXRHitTest } from "@galacean/engine-design";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureType } from "../XRFeatureType";
import { IXRHitTestDescriptor } from "./IXRHitTestDescriptor";

@registerXRFeatureManager(XRFeatureType.HitTest)
export class XRHitTestManager extends XRFeatureManager<IXRHitTestDescriptor> {
  hitTest(x: number, y: number): Promise<void> {
    // @ts-ignore
    return (<IXRHitTest>this.platformFeature).hitTest(x, y);
  }
}
