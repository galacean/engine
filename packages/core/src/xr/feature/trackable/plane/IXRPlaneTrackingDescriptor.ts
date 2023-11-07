import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRPlaneDetectionMode } from "./XRPlaneDetectionMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRPlaneDetectionMode;
}
