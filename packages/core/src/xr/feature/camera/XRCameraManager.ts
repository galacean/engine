import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { Logger } from "../../../base";
import { XRInputType } from "../../input/XRInputType";
import { XRInputManager } from "../../input/XRInputManager";
import { XRCamera } from "../../input/XRCamera";
import { XRFeatureManager } from "../XRFeatureManager";
import { IXRCameraDescriptor } from "./IXRCameraDescriptor";

/**
 * 1. 管理相机前置后置
 * 2. 管理相机焦距
 * 3. 设置虚拟相机与现实相机的链接
 */
export class XRCameraManager extends XRFeatureManager<IXRCameraDescriptor> {
  private _inputManager: XRInputManager;
  private _fixedFoveation: number;

  attachCamera(source: XRInputType, camera: Camera): void {
    const xrViewer = this._inputManager.getInput<XRCamera>(source);
    if (xrViewer) {
      xrViewer.camera = camera;
    } else {
      Logger.warn(XRInputType[source], "not a legal input type.");
    }
  }

  detachCamera(source: XRInputType): Camera {
    const xrViewer = this._inputManager.getInput<XRCamera>(source);
    const preCamera = xrViewer.camera;
    xrViewer.camera = null;
    return preCamera;
  }

  set fixedFoveation(value: number) {
    value = Math.max(0, Math.min(1, value || 0));
    this._fixedFoveation = value;
  }

  get fixedFoveation() {
    return this._fixedFoveation;
  }

  constructor(engine: Engine) {
    super(engine);
  }
}
