import { Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTracked } from "../IXRTracked";

export interface IXRRequestAnchor extends IXRRequestTracking<IXRTracked> {
  position: Vector3;
  rotation: Quaternion;
}
