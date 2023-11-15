import { IXRRequestTracking } from "@galacean/engine-design";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackedPlane } from "./XRTrackedPlane";

export class XRRequestTrackingPlane implements IXRRequestTracking<XRTrackedPlane> {
  constructor(
    public orientation: XRPlaneMode,
    public state: XRRequestTrackingState = XRRequestTrackingState.None,
    public tracked: XRTrackedPlane[] = []
  ) {}

  equals(other: XRRequestTrackingPlane): boolean {
    if (this === other) {
      return true;
    } else {
      return this.orientation === other.orientation;
    }
  }
}
