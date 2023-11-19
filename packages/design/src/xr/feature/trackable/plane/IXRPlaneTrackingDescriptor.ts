import { IXRFeatureDescriptor } from "../../IXRFeatureDescriptor";

/**
 * The descriptor of XR plane tracking.
 */
export interface IXRPlaneTrackingDescriptor extends IXRFeatureDescriptor {
  /** Rules for detecting planes. */
  mode: number;
}
