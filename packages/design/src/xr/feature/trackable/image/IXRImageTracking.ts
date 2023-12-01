import { IXRTrackableFeature } from "../IXRTrackableFeature";
import { IXRRequestImageTracking } from "./IXRRequestImageTracking";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRImageTracking extends IXRTrackableFeature<IXRTrackedImage, IXRRequestImageTracking> {}
