import { Script, XRInputManager, XRInputType } from "@galacean/engine";
import { XRTrackingMode } from "./XRTrackingMode";

/**
 * The pose driver of XR, you can set the input type and tracking
 * type to allow the node to synchronize the posture of the device.
 */
export class XRPoseDriver extends Script {
  /**
   * The type of input.
   */
  type: XRInputType = XRInputType.Camera;
  /**
   * The tracking mode.
   */
  trackingMode: XRTrackingMode = XRTrackingMode.RotationAndPosition;

  private _inputManager: XRInputManager;

  override onLateUpdate() {
    const input = this._inputManager.getInput(this.type);
    if (input) {
      switch (this.trackingMode) {
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
    this._inputManager = this.engine.xrManager.inputManager;
  }
}
