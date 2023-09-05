import { IXRHitTest } from "@galacean/engine-design";
import { Matrix } from "@galacean/engine-math";
import { registerXRFeatureManager } from "../XRModule";
import { XRFeatureManager } from "./XRFeatureManager";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { Utils } from "../../Utils";

type HitTestListenerConstructor = (matrices: Matrix[]) => void;

@registerXRFeatureManager(EnumXRFeature.HitTest)
export class XRHitTestManager extends XRFeatureManager {
  listeners: HitTestListenerConstructor[] = [];

  startHitTest(x: number, y: number): Promise<void> {
    return (<IXRHitTest>this._platformFeature).startHitTest(x, y);
  }

  stopHitTest(): Promise<void> {
    return (<IXRHitTest>this._platformFeature).stopHitTest();
  }

  addHitTestListener(listener: HitTestListenerConstructor): void {
    this.listeners.push(listener);
  }

  removeHitTestListener(listener: HitTestListenerConstructor): void {
    Utils.removeFromArray(this.listeners, listener);
  }
}
