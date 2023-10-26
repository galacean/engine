import { IXRHitTest } from "@galacean/engine-design";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureManager } from "../XRFeatureManager";
import { EnumXRFeature } from "../../enum/EnumXRFeature";

@registerXRFeatureManager(EnumXRFeature.HitTest)
export class XRHitTestManager extends XRFeatureManager {
  hitTest(x: number, y: number): Promise<void> {
    return (<IXRHitTest>this._platformFeature).hitTest(x, y);
  }
}
