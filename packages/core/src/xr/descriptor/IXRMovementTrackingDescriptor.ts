import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRTrackingMode;
}
