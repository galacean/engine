import { Vector3 } from "@galacean/engine-math";

/**
 * XR hit result.
 * It is the detection result returned by using XR HitTest feature.
 */
export interface IXRHitResult {
  /** The position of the hit point. */
  point: Vector3;
  /** The normal of the hit point. */
  normal: Vector3;
  /** The distance from the origin of the ray to the hit point. */
  distance: number;
  /** The id of the hit tracked object, such as the id of IXRTrackedPlane. */
  trackableId: number;
  /** The type of tracked object detected, such as TrackableType.Plane */
  trackableType: number;
}
