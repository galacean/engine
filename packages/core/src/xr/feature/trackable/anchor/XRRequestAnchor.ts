import { Quaternion, Vector3 } from "@galacean/engine-math";
import { XRRequestTracking } from "../XRRequestTracking";
import { XRAnchor } from "./XRAnchor";

/**
 * The request anchor in XR space.
 */
export class XRRequestAnchor extends XRRequestTracking<XRAnchor> {
  /**
   * @param position - Requests the position of the anchor to be added
   * @param rotation - Requests the rotation of the anchor to be added
   */
  constructor(
    public position: Vector3,
    public rotation: Quaternion
  ) {
    super();
    this.tracked = [new XRAnchor()];
  }
}
