import { EnumXRButton, DisorderedArray, XRHandle } from "@galacean/engine";

/**
 * XR 手柄
 */
export class WebXRHandle extends XRHandle {
  /** @internal */
  _inputSource: XRInputSource;
  /** @internal */
  _events: XRInputSourceEvent[] = [];
}
