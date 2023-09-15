import { IXRHitTest } from "@galacean/engine-design";
import { Matrix } from "@galacean/engine-math";
import { registerXRFeatureManager } from "../XRModule";
import { XRFeatureManager } from "./XRFeatureManager";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { Utils } from "../../Utils";

type HitTestListenerConstructor = (matrices: Matrix[]) => void;

@registerXRFeatureManager(EnumXRFeature.HitTest)
export class XRHitTestManager extends XRFeatureManager {
  hitTest(x: number, y: number): Promise<void> {
    return (<IXRHitTest>this._platformFeature).hitTest(x, y);
  }
}
