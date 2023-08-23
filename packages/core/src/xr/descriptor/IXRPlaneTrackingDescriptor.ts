import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { EnumXRPlaneTrackingMode } from "../enum/EnumXRPlaneTrackingMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRPlaneTrackingMode;
}
