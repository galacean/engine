export interface IXRDisplayManager {
  setCamera(inputSource: number): void;
  getCamera(inputSource: number): void;

  _onSessionStart(): void;
  _onSessionStop(): void;
  _onUpdate(): void;
  _onDestroy(): void;
}
