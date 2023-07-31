import { IXRDevice } from "../data/IXRDevice";
import { XRSubsystem } from "./XRSubsystem";

export abstract class XRInputSubsystem extends XRSubsystem {
  devices: IXRDevice[] = [];
}
