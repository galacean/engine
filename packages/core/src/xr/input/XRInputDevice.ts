import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { EnumXRInputState } from "../enum/EnumXRInputState";
import { Engine } from "../../Engine";

export class XRInputDevice {
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  state: EnumXRInputState = EnumXRInputState.Inactive;

  constructor(protected _engine: Engine) {}
}
