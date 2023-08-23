import { IXRFeatureDescriptor } from "../../descriptor/IXRFeatureDescriptor";
import { EnumXRPlaneTrackingMode } from "../../enum/EnumXRPlaneTrackingMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRPlaneTrackingMode;
}
