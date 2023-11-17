import { IXRRequestImageTracking } from "./IXRRequestImageTracking";
import { IXRTrackableFeature } from "../IXRTrackableFeature";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRImageTracking extends IXRTrackableFeature<IXRTrackedImage, IXRRequestImageTracking> {}
