import { IXRSession } from "../interface/IXRSession";
import { XRInputDevice } from "./XRInputDevice";

export interface IXRInputProvider {
  attach(session: IXRSession, inputs: XRInputDevice[]): void;
  update(): void;
  detach(): void;
  destroy(): void;
}
