import { Vector3 } from "@galacean/engine-math";
import { IXRTrackable } from "./IXRTrackable";

export interface IXRTrackedPlane extends IXRTrackable {
  orientation: "horizontal" | "vertical";
  polygon: Vector3[];
}
