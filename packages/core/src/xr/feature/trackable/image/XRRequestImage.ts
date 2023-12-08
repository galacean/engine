import { XRRequestTracking } from "../XRRequestTracking";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRTrackedImage } from "./XRTrackedImage";

export class XRRequestImage extends XRRequestTracking<XRTrackedImage> {
  constructor(public image: XRReferenceImage) {
    super();
  }
}
