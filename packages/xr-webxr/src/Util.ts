import { XRTrackedInputDevice } from "@galacean/engine";
import { WebXRDevice } from "./WebXRDevice";

export function generateUUID(): number {
  return ++WebXRDevice._uuid;
}

export function parseXRMode(mode: number): XRSessionMode | null {
  switch (mode) {
    case 1:
      return "immersive-ar";
    case 2:
      return "immersive-vr";
    default:
      return null;
  }
}

export function getInputSource(inputSource: XRInputSource): number {
  let type: number;
  switch (inputSource.targetRayMode) {
    case "gaze":
      break;
    case "screen":
      return XRTrackedInputDevice.Controller;
    case "tracked-pointer":
      if (inputSource.hand) {
        switch (inputSource.handedness) {
          case "left":
            return XRTrackedInputDevice.LeftHand;
          case "right":
            return XRTrackedInputDevice.RightHand;
        }
      } else {
        switch (inputSource.handedness) {
          case "left":
            return XRTrackedInputDevice.LeftController;
          case "right":
            return XRTrackedInputDevice.RightController;
        }
      }
      break;
    default:
      break;
  }
  return type;
}

export function viewToCamera(type: XREye): number {
  switch (type) {
    case "left":
      return XRTrackedInputDevice.LeftCamera;
    case "right":
      return XRTrackedInputDevice.RightCamera;
    default:
      return XRTrackedInputDevice.Camera;
  }
}
