import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRDevice } from "./IXRDevice";
import { EnumXRButton } from "../enum/EnumXRButton";
import { EnumXRDevicePhase } from "../enum/EnumXRDevicePhase";
import { DisorderedArray } from "../../DisorderedArray";

export class XRHandle implements IXRDevice {
  // pose
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  linearVelocity: Vector3 = new Vector3();
  // state
  phase: EnumXRDevicePhase = EnumXRDevicePhase.leave;
  // button info
  pressedButtons: EnumXRButton = EnumXRButton.None;
  upMap: number[] = [];
  downMap: number[] = [];
  upList: DisorderedArray<EnumXRButton> = new DisorderedArray();
  downList: DisorderedArray<EnumXRButton> = new DisorderedArray();
}
