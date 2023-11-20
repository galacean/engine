import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

/**
 * The descriptor of XR movement tracking.
 */
export interface IXRMovementTrackingDescriptor extends IXRFeatureDescriptor {
  /** The mode of movement tracking. */
  mode: number;
}
