import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRPlaneTrackingMode } from "./XRPlaneTrackingMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRPlaneTrackingMode;
}
