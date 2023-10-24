import { IXRInputManager } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRController } from "./XRController";
import { XRHand } from "./XRHand";
import { XRInput } from "./XRInput";
import { XRViewer } from "./XRViewer";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";

export abstract class XRInputManager implements IXRInputManager {
  protected _engine: Engine;
  protected _inputs: XRInput[] = [];

  getInput<T extends XRInput>(inputSource: EnumXRInputSource): T {
    return this._inputs[inputSource] as T;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    const { _inputs: inputs } = this;
    for (let i = EnumXRInputSource.Length - 1; i >= 0; i--) {
      switch (i) {
        case EnumXRInputSource.Controller:
        case EnumXRInputSource.LeftController:
        case EnumXRInputSource.RightController:
          inputs[i] = new XRController(engine);
          break;
        case EnumXRInputSource.Viewer:
        case EnumXRInputSource.LeftViewer:
        case EnumXRInputSource.RightViewer:
          inputs[i] = new XRViewer(engine);
          break;
        case EnumXRInputSource.LeftHand:
        case EnumXRInputSource.RightHand:
          inputs[i] = new XRHand(engine);
          break;
      }
    }
  }

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
  _onDestroy(): void {}
}
