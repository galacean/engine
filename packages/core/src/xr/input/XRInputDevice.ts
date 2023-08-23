import { Engine } from "../../Engine";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRInputDevice } from "@galacean/engine-design";

export abstract class XRInputDevice implements IXRInputDevice {
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  connected: boolean = false;

  constructor(protected _engine: Engine) {}
}
