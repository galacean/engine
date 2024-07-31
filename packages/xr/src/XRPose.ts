import { Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { IXRPose } from "@galacean/engine-design";

/**
 * Data for describing pose in the XR space.
 */
export class XRPose implements IXRPose {
  /** The position of the pose in XR space. */
  position: Vector3 = new Vector3();
  /** The rotation of the pose in XR space. */
  rotation: Quaternion = new Quaternion();
  /** The matrix of the pose in XR space. */
  matrix: Matrix = new Matrix();
  /** The inverse matrix of the pose in XR space. */
  inverseMatrix: Matrix = new Matrix();
}
