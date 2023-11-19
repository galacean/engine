import { IXRFeatureDescriptor } from "../../IXRFeatureDescriptor";
import { IXRReferenceImage } from "./IXRReferenceImage";

export interface IXRImageTrackingDescriptor extends IXRFeatureDescriptor {
  images?: IXRReferenceImage[];
}
