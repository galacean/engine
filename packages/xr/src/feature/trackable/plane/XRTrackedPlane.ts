import { Vector3 } from "@galacean/engine";
import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRTracked } from "../XRTracked";
import { XRPlaneMode } from "./XRPlaneMode";

/**
 * The tracked plane in XR space.
 */
export class XRTrackedPlane extends XRTracked implements IXRTrackedPlane {
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
