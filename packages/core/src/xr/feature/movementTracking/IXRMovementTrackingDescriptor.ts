import { XRImageTrackingMode } from "../../enum/XRImageTrackingMode";
import { IXRFeatureDescriptor } from "../../descriptor/IXRFeatureDescriptor";

export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRImageTrackingMode;
}
