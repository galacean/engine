import { Matrix, Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import { IXRDevice } from "./IXRDevice";
import { EnumXRDevicePhase } from "../enum/EnumXRDevicePhase";

export class XRCamera implements IXRDevice {
  // pose
  position: Vector3 = new Vector3();
  matrix: Matrix = new Matrix();
  quaternion: Quaternion = new Quaternion();
  linearVelocity: Vector3 = new Vector3();
  // display
  project: Matrix = new Matrix();
  viewport: Vector4 = new Vector4();
  // state
  phase: EnumXRDevicePhase = EnumXRDevicePhase.leave;
}
