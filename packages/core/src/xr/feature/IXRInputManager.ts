import { IXRFeature } from "@galacean/engine-design";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { IXRDevice } from "../data/IXRDevice";
import { EnumXRButton } from "../enum/EnumXRButton";

export interface IXRInputManager extends IXRFeature {
  getDevice<T extends IXRDevice>(source: EnumXRInputSource): T;
  isButtonDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean;
  isButtonUp(handedness: EnumXRInputSource, button: EnumXRButton): boolean;
  isButtonHeldDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean;
}
