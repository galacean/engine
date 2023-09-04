import { IXRInput } from "./IXRInput";

export interface IXRInputManager {
  getInput(inputSource: number): IXRInput;
  _onSessionStart(): void;
  _onSessionStop(): void;
  _onUpdate(): void;
  _onDestroy(): void;
}
