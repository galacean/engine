import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

export class IXRInput {
  matrix: Matrix;
  position: Vector3;
  quaternion: Quaternion;
  connected: boolean;
}
