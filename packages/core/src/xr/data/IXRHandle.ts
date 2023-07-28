import { EnumXRButton } from "../enum/EnumXRButton";
import { IXRDevice } from "./IXRDevice";

export interface IXRHandle extends IXRDevice {
  pressedButtons: EnumXRButton;
}
