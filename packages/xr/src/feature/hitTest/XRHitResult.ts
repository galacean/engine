import { IXRTracked } from "@galacean/engine-design";
import { TrackableType } from "./TrackableType";
import { Vector3 } from "@galacean/engine";

/**
 * XR hit result.
 * It is the detection result returned by using XR HitTest feature.
 */
export class XRHitResult {
  /** The position of the hit point. */
  point: Vector3 = new Vector3();
  /** The normal of the hit point. */
  normal: Vector3 = new Vector3();
  /** The distance from the origin of the ray to the hit point. */
  distance: number;
  /** The hit tracked object, such as IXRTrackedPlane. */
  trackedObject: IXRTracked;
  /** The type of tracked object detected, such as TrackableType.Plane */
  trackableType: TrackableType;
}
