import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { Logger } from "../../../base";
import { XRInputType } from "../../input/XRInputType";
import { XRInputManager } from "../../input/XRInputManager";
import { XRCamera } from "../../input/XRCamera";
import { XRFeatureManager } from "../XRFeatureManager";
import { IXRCameraDescriptor } from "./IXRCameraDescriptor";
import { XRPlatformCamera } from "./XRPlatformCamera";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureType } from "../XRFeatureType";

/**
 * 1. 管理相机前置后置
 * 2. 管理相机焦距
 * 3. 设置虚拟相机与现实相机的链接
 */
@registerXRFeatureManager(XRFeatureType.CameraDevice)
export class XRCameraManager extends XRFeatureManager<IXRCameraDescriptor, XRPlatformCamera> {
  private _inputManager: XRInputManager;
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
    this.platformFeature.setFixedFoveation(value);
  }

  get fixedFoveation() {
    return this.platformFeature.getFixedFoveation();
  }

  constructor(engine: Engine) {
    super(engine);
    this._inputManager = engine.xrModule.inputManager;
  }
}
