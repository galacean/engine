import { EnumXRInputSource } from "./enum/EnumXRInputSource";
import { XRInput } from "./input/XRInput";

export class XRInputManager {
  private _provider: any;

  // @internal
  _inputs: XRInput[] = [];

  getInput<T extends XRInput>(inputSource: EnumXRInputSource): T {
    return this._inputs[inputSource] as T;
  }

  // @internal
  _update() {
    this._provider.maintain(this._inputs);
  }
}
