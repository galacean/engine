import { IXRFeatureConfig } from "../feature/IXRFeatureConfig";

/**
 * Interface for XR session descriptors
 */
export interface IXRSessionDescriptor {
  /** The type of XR session. */
  mode: number;
  /** Requested features. */
  requestFeatures: IXRFeatureConfig[];
}
