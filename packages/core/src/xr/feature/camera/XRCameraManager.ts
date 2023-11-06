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

@registerXRFeatureManager(XRFeatureType.CameraDevice)
export class XRCameraManager extends XRFeatureManager<IXRCameraDescriptor, XRPlatformCamera> {
  private _inputManager: XRInputManager;

  override get enabled() {
    return true;
  }

  override set enabled(value: boolean) {
    Logger.warn("XRCameraManager.enabled is always true and cannot be changed.");
  }

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
    this._platformFeature.fixedFoveation = value;
  }

  get fixedFoveation() {
    return this._platformFeature.fixedFoveation;
  }

  constructor(engine: Engine) {
    super(engine);
    this._inputManager = engine.xrModule.inputManager;
    this._enabled = true;
  }
}
