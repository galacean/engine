import { Script } from "../../Script";
import { XRInputManager } from "../input/XRInputManager";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";

export class XRPoseDriver extends Script {
  source: EnumXRInputSource = EnumXRInputSource.Viewer;
  updateType: EnumXRTrackingMode = EnumXRTrackingMode.RotationAndPosition;

  private _inputManager: XRInputManager;

  override onLateUpdate() {
    const { _inputManager: inputManager } = this;
    const pose = inputManager.getInput(this.source);
    if (pose) {
      switch (this.updateType) {
        case EnumXRTrackingMode.RotationOnly:
          this.entity.transform.rotationQuaternion = pose.quaternion;
          break;
        case EnumXRTrackingMode.PositionOnly:
          this.entity.transform.position = pose.position;
          break;
        case EnumXRTrackingMode.RotationAndPosition:
          this.entity.transform.localMatrix = pose.matrix;
          break;
        default:
          break;
      }
    }
  }

  override onAwake(): void {
    this._inputManager = this.engine.xrModule.inputManager;
  }
}
