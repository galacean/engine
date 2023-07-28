import { Script } from "../../Script";
import { IXRDevice } from "../data/IXRDevice";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
import { IXRInputManager } from "../feature/IXRInputManager";

export class XRPoseDriver extends Script {
  source: EnumXRInputSource = EnumXRInputSource.Eye;
  updateType: EnumXRTrackingMode = EnumXRTrackingMode.RotationAndPosition;

  override onLateUpdate() {
    const { xrManager } = this.engine;
    if (!xrManager) {
      return;
    }
    const input = xrManager.getFeature<IXRInputManager>(EnumXRFeature.input);
    if (!input) {
      return;
    }
    const pose = input.getDevice<IXRDevice>(this.source);
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
}
