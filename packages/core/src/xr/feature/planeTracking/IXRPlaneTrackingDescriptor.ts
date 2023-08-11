import { IXRFeatureDescriptor } from "../../descriptor/IXRFeatureDescriptor";
import { XRPlaneTrackingMode } from "../../enum/XRPlaneTrackingMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRPlaneTrackingMode;
}
