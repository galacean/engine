import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

/**
 * Data interface for describing gestures in the XR world.
 */
export interface IXRPose {
  position: Vector3;
  rotation: Quaternion;
  matrix?: Matrix;
  inverseMatrix?: Matrix;
}
