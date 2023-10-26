import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { XRReferenceImage } from "./XRReferenceImage";

export interface IXRImageTrackingDescriptor extends IXRFeatureDescriptor {
  referenceImages?: XRReferenceImage[];
}
