import { EnumXRMode, EnumXRFeature, EnumXRInputSource } from "@galacean/engine";
import { IXRFeatureDescriptor } from "@galacean/engine-design";

export function parseXRMode(mode: EnumXRMode): XRSessionMode {
  switch (mode) {
    case EnumXRMode.AR:
      return "immersive-ar";
    case EnumXRMode.VR:
      return "immersive-vr";
    default:
      return null;
  }
}

export function parseFeatures(descriptors: IXRFeatureDescriptor[], out: string[]): string[] {
  for (let i = 0, n = descriptors.length; i < n; i++) {
    const feature = descriptors[i];
    switch (feature.type) {
      case EnumXRFeature.HandTracking:
        out.push("hand-tracking");
        break;
      case EnumXRFeature.ImageTracking:
        out.push("image-tracking");
        break;
      case EnumXRFeature.HitTest:
        out.push("hit-test");
        break;
      case EnumXRFeature.PlaneTracking:
        out.push("plane-detection");
        break;
      default:
        break;
    }
  }
  return out;
}

export function getInputSource(inputSource: XRInputSource): EnumXRInputSource {
  let type: EnumXRInputSource;
  switch (inputSource.targetRayMode) {
    case "gaze":
      break;
    case "screen":
      return EnumXRInputSource.Controller;
    case "tracked-pointer":
      if (inputSource.hand) {
        switch (inputSource.handedness) {
          case "left":
            return EnumXRInputSource.LeftHand;
          case "right":
            return EnumXRInputSource.RightHand;
        }
      } else {
        switch (inputSource.handedness) {
          case "left":
            return EnumXRInputSource.LeftController;
          case "right":
            return EnumXRInputSource.RightController;
        }
      }
      break;
    default:
      break;
  }
  return type;
}

export function eyeToInputSource(eye: XREye): EnumXRInputSource {
  switch (eye) {
    case "left":
      return EnumXRInputSource.LeftViewer;
    case "right":
      return EnumXRInputSource.RightViewer;
    default:
      return EnumXRInputSource.Viewer;
  }
}
