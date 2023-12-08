import { Quaternion, Vector3 } from "@galacean/engine-math";
import { XRRequestTracking } from "../XRRequestTracking";
import { XRAnchor } from "./XRAnchor";

export class XRRequestAnchor extends XRRequestTracking<XRAnchor> {
  constructor(
    public position: Vector3,
    public rotation: Quaternion
  ) {
    super();
    this.tracked = [new XRAnchor()];
  }
}
