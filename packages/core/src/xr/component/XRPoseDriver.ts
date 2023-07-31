import { Script } from "../../Script";
import { XRManager } from "../XRManager";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
import { XRInputManager } from "../feature/XRInputManager";

export class XRPoseDriver extends Script {
  source: EnumXRInputSource = EnumXRInputSource.Eye;
  updateType: EnumXRTrackingMode = EnumXRTrackingMode.RotationAndPosition;

  private _xrManager: XRManager;

  override onLateUpdate() {
    const input = this._xrManager?.getFeature<XRInputManager>(EnumXRFeature.input);
    if (!input) {
      return;
    }
    const pose = input.getDevice(this.source);
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
    this._xrManager = this.engine.xrManager;
  }
}
