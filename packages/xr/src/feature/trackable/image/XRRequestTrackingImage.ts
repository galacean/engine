import { IXRReferenceImage, IXRRequestTracking } from "@galacean/engine-design";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackedImage } from "./XRTrackedImage";

export class XRRequestTrackingImage implements IXRRequestTracking<XRTrackedImage> {
  constructor(
    public image: IXRReferenceImage,
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
