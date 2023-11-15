import { IXRFeatureDescriptor } from "../feature/IXRFeatureDescriptor";

/**
 * Interface for XR session descriptors
 */
export interface IXRSessionDescriptor {
  /** The type of XR session. */
  mode: number;
  /** Requested features. */
  requestFeatures: IXRFeatureDescriptor[];
}
