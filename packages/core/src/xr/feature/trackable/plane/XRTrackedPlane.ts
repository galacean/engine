import { Vector3 } from "@galacean/engine-math";
import { XRTracked } from "../XRTracked";

export class XRTrackedPlane extends XRTracked {
  /** Whether the detected plane is horizontal or vertical. */
  orientation: number;
  /** The points that make up this plane.
   *  Note: These points are in the plane coordinate system,
   *  and their Y coordinates are all zero.
   */
  polygon: Vector3[];
}
