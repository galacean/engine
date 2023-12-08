import { Vector3 } from "@galacean/engine-math";
import { XRTracked } from "../XRTracked";
import { XRPlaneMode } from "./XRPlaneMode";

export class XRTrackedPlane extends XRTracked {
  /** Whether the detected plane is horizontal or vertical. */
  planeMode: XRPlaneMode;
  /** The points that make up this plane.
   *  Note: These points are in the plane coordinate system,
   *  and their Y coordinates are all zero.
   */
  polygon: Vector3[] = [];
  /**
   * Whether this frame changes the attributes of the plane.
   * Note: Includes `polygon` but no `pose`.
   */
  attributesDirty: boolean = false;
}
