import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRPlaneMode } from "./XRPlaneMode";

/**
 * The descriptor of XR plane tracking.
 */
export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  /** Rules for detecting planes. */
  mode: XRPlaneMode;
}
