import { Matrix } from "@galacean/engine-math";
import { registerXRFeature } from "../../XRManager";
import { XRFeature } from "../XRFeature";
import { EnumXRFeature } from "../../enum/EnumXRFeature";

@registerXRFeature(EnumXRFeature.HitTest)
export class XRHitTest extends XRFeature {
  hitTest(x: number, y: number): Promise<Matrix[]> {
    // @ts-ignore
    return this._provider.hitTest(x, y);
  }
}
