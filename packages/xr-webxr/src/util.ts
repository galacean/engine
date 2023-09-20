import { EnumXRMode, EnumXRFeature } from "@galacean/engine";
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
