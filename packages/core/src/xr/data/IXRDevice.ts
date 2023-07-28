import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { EnumXRDevicePhase } from "../enum/EnumXRDevicePhase";

export interface IXRDevice {
  matrix: Matrix;
  position: Vector3;
  quaternion: Quaternion;
  phase: EnumXRDevicePhase;
  linearVelocity: Vector3;
}
