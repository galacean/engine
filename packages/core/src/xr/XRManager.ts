import { IXRDevice } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { CameraType } from "../enums/CameraType";

/**
 * XRManager located in the main package, its implementation logic is XRManagerExtended in the sub-package engine-xr.
 */
export class XRManager {
  /**
   * @internal
   */
  _initialize(engine: Engine, xrDevice: IXRDevice): void {}

  /**
   * @internal
   */
  _update(): void {}

  /**
   * @internal
   */
  _destroy(): void {}

  /**
   * @internal
   */
  _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number {
    return null;
  }

  /**
   * @internal
   */
  _getCancelAnimationFrame(): (id: number) => void {
    return null;
  }
  /**
   * @internal
   */
  _getCameraClearFlagsMask(type: CameraType): CameraClearFlags {
    return CameraClearFlags.None;
  }
}
