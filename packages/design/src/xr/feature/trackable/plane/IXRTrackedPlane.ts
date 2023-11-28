import { Vector3 } from "@galacean/engine-math";
import { IXRTracked } from "../IXRTracked";

export interface IXRTrackedPlane extends IXRTracked {
  /** Whether the detected plane is horizontal or vertical. */
  planeMode: number;
  /** The points that make up this plane.
   *  Note: These points are in the plane coordinate system,
   *  and their Y coordinates are all zero.
   */
  polygon: Vector3[];
  /**
   * Whether this frame changes the attributes of the plane.
   * Note: Includes `polygon` but no `pose`.
   */
  attributesDirty: boolean;
}
