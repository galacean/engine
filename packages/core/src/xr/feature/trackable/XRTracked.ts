import { IXRPose, IXRTracked } from "@galacean/engine-design";
import { XRTrackingState } from "../../input/XRTrackingState";

export class XRTracked implements IXRTracked {
  constructor(
    public id: number,
    public pose: IXRPose,
    public state: XRTrackingState = XRTrackingState.NotTracking,
    public frameCount: number = 0
  ) {}
}
