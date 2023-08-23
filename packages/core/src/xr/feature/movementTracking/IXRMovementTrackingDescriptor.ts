import { IXRFeatureDescriptor } from "../../descriptor/IXRFeatureDescriptor";
import { EnumXRTrackingMode } from "../../enum/EnumXRTrackingMode";
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRTrackingMode;
}
