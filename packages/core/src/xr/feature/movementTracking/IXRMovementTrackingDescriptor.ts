import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  mode: XRMovementTrackingMode;
}
