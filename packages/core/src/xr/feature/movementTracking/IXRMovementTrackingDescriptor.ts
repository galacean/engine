import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
/**
 * The descriptor of XR movement tracking.
 */
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  /** The mode of movement tracking. */
  mode: XRMovementTrackingMode;
}
