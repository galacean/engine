import { Vector2 } from "@galacean/engine-math";
import { XRTrackable } from "../XRTrackable";

export class XRTrackedImage extends XRTrackable {
  referIdx: number;
  size: Vector2;
}
