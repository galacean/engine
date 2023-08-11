import { EnumXRMode } from "@galacean/engine";

export function parseXRMode(mode: number): XRSessionMode {
  switch (mode) {
    case EnumXRMode.AR:
      return "immersive-ar";
    case EnumXRMode.VR:
      return "immersive-vr";
    default:
      return null;
  }
}
