import { IXRInputManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRController } from "./XRController";
import { XRInput } from "./XRInput";
import { XRViewer } from "./XRViewer";
import { XRInputType } from "./XRInputType";

export abstract class XRInputManager implements IXRInputManager {
  protected _engine: Engine;
  protected _inputs: XRInput[] = [];

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
        case XRInputType.Viewer:
        case XRInputType.LeftViewer:
        case XRInputType.RightViewer:
          inputs[i] = new XRViewer(engine);
          break;
      }
    }
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
