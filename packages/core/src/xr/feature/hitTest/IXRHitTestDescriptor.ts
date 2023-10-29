import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRHitTestMode } from "./XRHitTestMode";

export interface IXRHitTestDescriptor extends IXRFeatureDescriptor {
  mode: XRHitTestMode;
}
