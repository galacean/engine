import { Script } from "../../Script";
import { XRInputManager } from "../XRInputManager";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { XRImageTrackingMode } from "../enum/XRImageTrackingMode";

export class XRPoseDriver extends Script {
  source: EnumXRInputSource = EnumXRInputSource.Viewer;
  updateType: XRImageTrackingMode = XRImageTrackingMode.RotationAndPosition;

  private _inputManager: XRInputManager;

  override onLateUpdate() {
    const { _inputManager: inputManager } = this;
    const pose = inputManager.getInput(this.source);
    if (pose) {
      switch (this.updateType) {
        case XRImageTrackingMode.RotationOnly:
          this.entity.transform.rotationQuaternion = pose.quaternion;
          break;
        case XRImageTrackingMode.PositionOnly:
          this.entity.transform.position = pose.position;
          break;
        case XRImageTrackingMode.RotationAndPosition:
          this.entity.transform.localMatrix = pose.matrix;
          break;
        default:
          break;
      }
    }
  }

  override onAwake(): void {
    this._inputManager = this.engine.xrManager.inputManager;
  }
}
