import { Script } from "../../Script";
import { XRInputManager } from "../input/XRInputManager";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
import { XRInputType } from "../input/XRInputType";

export class XRPoseDriver extends Script {
  source: XRInputType = XRInputType.Camera;
  updateType: EnumXRTrackingMode = EnumXRTrackingMode.RotationAndPosition;

  private _inputManager: XRInputManager;

  override onLateUpdate() {
    const input = this._inputManager.getInput(this.source);
    if (input) {
      switch (this.updateType) {
        case EnumXRTrackingMode.RotationOnly:
          this.entity.transform.rotationQuaternion = input.pose.rotation;
          break;
        case EnumXRTrackingMode.PositionOnly:
          this.entity.transform.position = input.pose.position;
          break;
        case EnumXRTrackingMode.RotationAndPosition:
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
