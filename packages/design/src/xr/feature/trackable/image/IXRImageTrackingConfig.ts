import { IXRFeatureConfig } from "../../IXRFeatureConfig";
import { IXRReferenceImage } from "./IXRReferenceImage";

/**
 * The config of XR image tracking.
 */
export interface IXRImageTrackingConfig extends IXRFeatureConfig {
  images?: IXRReferenceImage[];
}
