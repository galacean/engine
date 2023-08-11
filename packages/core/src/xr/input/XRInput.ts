import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { EnumXRInputState } from "../enum/EnumXRInputState";

export class XRInput {
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  state: EnumXRInputState = EnumXRInputState.Inactive;
}
