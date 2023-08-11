import { DisorderedArray } from "../../DisorderedArray";
import { EnumXRButton } from "../enum/EnumXRButton";
import { XRInput } from "./XRInput";

export class XRController extends XRInput {
  pressedButtons: EnumXRButton;
  upMap: number[] = [];
  downMap: number[] = [];
  upList: DisorderedArray<EnumXRButton> = new DisorderedArray();
  downList: DisorderedArray<EnumXRButton> = new DisorderedArray();

  isButtonDown(button: EnumXRButton): boolean {
    return false;
  }
  isButtonUp(button: EnumXRButton): boolean {
    return false;
  }
  isButtonHeldDown(button: EnumXRButton): boolean {
    return false;
  }
}
