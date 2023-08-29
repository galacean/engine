import { Matrix } from "@galacean/engine-math";
import { registerXRFeature } from "../XRManager";
import { XRFeature } from "./XRFeature";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { IXRHitTest } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { IXRFeatureDescriptor } from "../descriptor/IXRFeatureDescriptor";

@registerXRFeature(EnumXRFeature.HitTest)
export class XRHitTest extends XRFeature {
  private _platformHitTest: IXRHitTest;

  hitTest(x: number, y: number): Promise<Matrix[]> {
    return this._platformHitTest.hitTest(x, y);
  }

  constructor(engine: Engine, descriptor: IXRFeatureDescriptor) {
    super(engine, descriptor);
  }
}
