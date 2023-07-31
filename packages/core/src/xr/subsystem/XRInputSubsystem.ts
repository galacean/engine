import { XRDevice } from "../data/XRDevice";
import { XRSubsystem } from "./XRSubsystem";

export abstract class XRInputSubsystem extends XRSubsystem {
  devices: XRDevice[] = [];
}
