import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { EnumXRPlaneTrackingMode } from "../../enum/EnumXRPlaneTrackingMode";

export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRPlaneTrackingMode;
}
