
import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { EnumXRHandTrackingMode } from "../enum/EnumXRHandTrackingMode";

export interface IXRHandTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRHandTrackingMode;
}
