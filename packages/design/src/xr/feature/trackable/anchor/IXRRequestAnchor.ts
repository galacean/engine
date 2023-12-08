import { Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTracked } from "../IXRTracked";

export interface IXRRequestAnchor<T extends IXRTracked> extends IXRRequestTracking<T> {
  position: Vector3;
  rotation: Quaternion;
}
