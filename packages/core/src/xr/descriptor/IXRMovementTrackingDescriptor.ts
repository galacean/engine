import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRTrackingMode;
}
