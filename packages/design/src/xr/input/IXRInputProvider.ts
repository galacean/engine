import { IXRSession } from "../IXRSession";
import { IXRInputDevice } from "./IXRInputDevice";

export interface IXRInputProvider {
  attach(session: IXRSession, inputs: IXRInputDevice[]): void;
  detach(): void;
  onXRFrame(): void;
  destroy(): void;
}
