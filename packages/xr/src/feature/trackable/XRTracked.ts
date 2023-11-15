import { XRTrackingState } from "@galacean/engine";
import { IXRPose, IXRTracked } from "@galacean/engine-design";

export class XRTracked implements IXRTracked {
  constructor(
    public id: number,
    public pose: IXRPose,
    public state: XRTrackingState = XRTrackingState.NotTracking,
    public frameCount: number = 0
  ) {}
}
