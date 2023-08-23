import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { EnumXRHandTrackingMode } from "../enum/EnumXRHandTrackingMode";

export interface IXRHandTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRHandTrackingMode;
}
