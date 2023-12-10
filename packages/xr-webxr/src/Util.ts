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
      return 0;
    case "tracked-pointer":
      if (inputSource.hand) {
        switch (inputSource.handedness) {
          case "left":
            return 6;
          case "right":
            return 7;
        }
      } else {
        switch (inputSource.handedness) {
          case "left":
            return 1;
          case "right":
            return 2;
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
      return 4;
    case "right":
      return 5;
    default:
      return 3;
  }
}
