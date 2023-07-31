import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { EnumXRDevicePhase } from "../enum/EnumXRDevicePhase";

export class XRDevice {
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  linearVelocity: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  phase: EnumXRDevicePhase = EnumXRDevicePhase.leave;
}
