import { IXRRequestTracking } from "@galacean/engine-design";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackedImage } from "./XRTrackedImage";
import { XRReferenceImage } from "./XRReferenceImage";

export class XRRequestTrackingImage implements IXRRequestTracking<XRTrackedImage> {
  constructor(
    public image: XRReferenceImage,
    public state: XRRequestTrackingState = XRRequestTrackingState.None,
    public tracked: XRTrackedImage[] = []
  ) {}

  equals(other: XRRequestTrackingImage): boolean {
    if (this === other) {
      return true;
    } else {
      return this.image === other.image;
    }
  }
}
