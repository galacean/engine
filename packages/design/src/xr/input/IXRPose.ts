import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

export interface IXRPose {
  matrix?: Matrix;
  position: Vector3;
  rotation: Quaternion;
}
