import { IXRInputManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRController } from "./XRController";
import { XRCamera } from "./XRCamera";
import { XRInputType } from "./XRInputType";
import { XRInput } from "./XRInput";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "../feature/trackable/XRTrackedUpdateFlag";

type TrackableListener = (type: XRTrackedUpdateFlag, param: readonly XRInput[]) => {};
export abstract class XRInputManager implements IXRInputManager {
  protected _engine: Engine;
  protected _inputs: XRInput[] = [];
  protected _added: XRInput[] = [];
  protected _updated: XRInput[] = [];
  protected _removed: XRInput[] = [];
  protected _trackingUpdate: UpdateFlagManager = new UpdateFlagManager();

  getInput<T extends XRInput>(inputSource: XRInputType): T {
    return this._inputs[inputSource] as T;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    const { _inputs: inputs } = this;
    for (let i = XRInputType.Length - 1; i >= 0; i--) {
      switch (i) {
        case XRInputType.Controller:
        case XRInputType.LeftController:
        case XRInputType.RightController:
          inputs[i] = new XRController(engine);
          break;
        case XRInputType.Camera:
        case XRInputType.LeftCamera:
        case XRInputType.RightCamera:
          inputs[i] = new XRCamera();
          break;
      }
    }
  }

  addListener(listener: TrackableListener) {
    this._trackingUpdate.addListener(listener);
  }

  removeListener(listener: TrackableListener) {
    this._trackingUpdate.removeListener(listener);
  }

  /**
   * @internal
   */
  _onSessionInit(): void {}

  /**
   * @internal
   */
  _onSessionStart(): void {}

  /**
   * @internal
   */
  _onUpdate(): void {}

  /**
   * @internal
   */
  _onSessionStop(): void {}

  /**
   * @internal
   */
  _onSessionDestroy(): void {}

  /**
   * @internal
   */
  _onDestroy(): void {}
}
