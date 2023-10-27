import { IXRInput } from "./IXRInput";

export interface IXRInputManager {
  getInput(inputSource: number): IXRInput;
  _onSessionInit(): void;
  _onSessionStart(): void;
  _onSessionStop(): void;
  _onSessionDestroy(): void;
  _onUpdate(): void;
  _onDestroy(): void;
}
