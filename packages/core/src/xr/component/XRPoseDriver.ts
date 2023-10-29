import { Script } from "../../Script";
import { XRInputManager } from "../input/XRInputManager";
import { XRTrackingMode } from "./XRTrackingMode";
import { XRInputType } from "../input/XRInputType";

export class XRPoseDriver extends Script {
  source: XRInputType = XRInputType.Camera;
  updateType: XRTrackingMode = XRTrackingMode.RotationAndPosition;

  private _inputManager: XRInputManager;

  override onLateUpdate() {
    const input = this._inputManager.getInput(this.source);
    if (input) {
      switch (this.updateType) {
        case XRTrackingMode.RotationOnly:
          this.entity.transform.rotationQuaternion = input.pose.rotation;
          break;
        case XRTrackingMode.PositionOnly:
          this.entity.transform.position = input.pose.position;
          break;
        case XRTrackingMode.RotationAndPosition:
          this.entity.transform.localMatrix = input.pose.matrix;
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
