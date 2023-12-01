import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

/**
 * Data interface for describing gestures in the XR space.
 */
export interface IXRPose {
  /** The position of the pose in XR space. */
  position: Vector3;
  /** The rotation of the pose in XR space. */
  rotation: Quaternion;
  /** The matrix of the pose in XR space. */
  matrix?: Matrix;
  /** The inverse matrix of the pose in XR space. */
  inverseMatrix?: Matrix;
}
