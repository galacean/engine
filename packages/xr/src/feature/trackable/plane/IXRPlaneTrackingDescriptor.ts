import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRPlaneMode } from "./XRPlaneMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRPlaneMode;
}
