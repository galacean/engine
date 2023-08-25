import { Vector2 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { EnumXRButton } from "../enum/EnumXRButton";
import { XRInputDevice } from "./XRInputDevice";
import { XRPointer } from "./XRPointer";

export class XRController extends XRInputDevice {
  pointers: XRPointer[] = [];
  stick: Vector2 = new Vector2();
  pressedButtons: EnumXRButton;
  upMap: number[] = [];
  downMap: number[] = [];
  upList: DisorderedArray<EnumXRButton> = new DisorderedArray();
  downList: DisorderedArray<EnumXRButton> = new DisorderedArray();

  isButtonDown(button: EnumXRButton): boolean {
    return this.downMap[button] === this._engine.time.frameCount;
  }
  isButtonUp(button: EnumXRButton): boolean {
    return this.upMap[button] === this._engine.time.frameCount;
  }
  isButtonHeldDown(button: EnumXRButton): boolean {
    return (this.pressedButtons & button) !== 0;
  }
}
