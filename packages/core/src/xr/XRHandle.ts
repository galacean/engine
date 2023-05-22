import { Matrix, Vector3 } from "@galacean/engine-math";
import { DisorderedArray } from "../DisorderedArray";
import { EnumXRButtonBin, EnumXRButtonDec } from "./enum/EnumXRButton";

/**
 * XR 手柄
 */
export class XRHandle {
  /** The currently pressed buttons for this pointer. */
  pressedButtons: EnumXRButtonBin = EnumXRButtonBin.None;
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  linearVelocity: Vector3 = new Vector3();
  /** @internal */
  _events: XRInputSourceEvent[] = [];
  /** @internal */
  _upMap: number[] = [];
  /** @internal */
  _downMap: number[] = [];
  /** @internal */
  _upList: DisorderedArray<EnumXRButtonDec> = new DisorderedArray();
  /** @internal */
  _downList: DisorderedArray<EnumXRButtonDec> = new DisorderedArray();
}
