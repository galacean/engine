import { Vector2 } from "@galacean/engine-math";
import { IXRTrackable } from "./IXRTrackable";

export interface IXRTrackedImage extends IXRTrackable {
  referIdx: number;
  size: Vector2;
}
