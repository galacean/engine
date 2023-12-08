import { Quaternion, Vector3 } from "@galacean/engine-math";
import { XRRequestTracking } from "../XRRequestTracking";
import { XRTrackedAnchor } from "./XRTrackedAnchor";

export class XRRequestAnchor extends XRRequestTracking<XRTrackedAnchor> {
  constructor(
    public position: Vector3,
    public rotation: Quaternion
  ) {
    super();
    this.tracked.push(new XRTrackedAnchor());
  }
}
