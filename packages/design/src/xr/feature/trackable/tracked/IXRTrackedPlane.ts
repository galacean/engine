import { Vector3 } from "@galacean/engine-math";
import { IXRTracked } from "./IXRTracked";

export interface IXRTrackedPlane extends IXRTracked {
  orientation: "horizontal" | "vertical";
  polygon: Vector3[];
}
