import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRPose } from "./IXRPose";

export class IXRInput {
  matrix: Matrix;
  position: Vector3;
  quaternion: Quaternion;
  pose: IXRPose;
  trackingState: number;
}
