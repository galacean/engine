import { XRDevice } from "./XRDevice";
import { EnumXRButton } from "../enum/EnumXRButton";
import { DisorderedArray } from "../../DisorderedArray";

export class XRHandle extends XRDevice {
  // button
  pressedButtons: EnumXRButton = EnumXRButton.None;
  upMap: number[] = [];
  downMap: number[] = [];
  upList: DisorderedArray<EnumXRButton> = new DisorderedArray();
  downList: DisorderedArray<EnumXRButton> = new DisorderedArray();
}
