import { IXRPose, IXRRequestTracking } from "@galacean/engine-design";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTracked } from "../XRTracked";
import { Quaternion, Vector3 } from "@galacean/engine-math";

export class XRRequestTrackingAnchor implements IXRRequestTracking<XRTracked> {
  constructor(
    public pose: IXRPose,
    public state: XRRequestTrackingState = XRRequestTrackingState.None,
    public tracked: XRTracked[] = []
  ) {}

  equals(other: XRRequestTrackingAnchor): boolean {
    if (this === other) {
      return true;
    } else {
      const { pose: myPose } = this;
      const { pose: otherPose } = other;
      return (
        Vector3.equals(myPose.position, otherPose.position) && Quaternion.equals(myPose.rotation, otherPose.rotation)
      );
    }
  }
}
