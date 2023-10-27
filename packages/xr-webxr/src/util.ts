import { EnumXRMode, EnumXRFeature, EnumXRInputSource, IXRImageTrackingDescriptor, request } from "@galacean/engine";
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

export function parseFeature(descriptor: IXRFeatureDescriptor, options: XRSessionInit): Promise<void> | null {
  const { requiredFeatures } = options;
  switch (descriptor.type) {
    case EnumXRFeature.ImageTracking:
      requiredFeatures.push("image-tracking");
      const { referenceImages } = <IXRImageTrackingDescriptor>descriptor;
      const promiseArr: Promise<ImageBitmap>[] = [];
      if (referenceImages) {
        for (let i = 0, n = referenceImages.length; i < n; i++) {
          const referenceImage = referenceImages[i];
          const { src } = referenceImages[i];
          if (!src) {
            return Promise.reject(new Error("referenceImage[" + referenceImage.name + "].src is null"));
          } else {
            if (typeof src === "string") {
              promiseArr.push(createImageBitmapByURL(src));
            } else {
              promiseArr.push(createImageBitmap(src));
            }
          }
        }
        return new Promise((resolve, reject) => {
          // @ts-ignore
          const trackedImages = (options.trackedImages = []);
          Promise.all(promiseArr).then((bitmaps: ImageBitmap[]) => {
            for (let i = 0, n = bitmaps.length; i < n; i++) {
              const bitmap = bitmaps[i];
              trackedImages.push({
                image: bitmap,
                widthInMeters: referenceImages[i].physicalWidth ?? bitmap.width / 100
              });
            }
            resolve();
          }, reject);
        });
      } else {
        return Promise.reject(new Error("referenceImages.length is 0"));
      }
    case EnumXRFeature.HitTest:
      requiredFeatures.push("hit-test");
      break;
    case EnumXRFeature.PlaneTracking:
      requiredFeatures.push("plane-detection");
      break;
  }
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

function createImageBitmapByURL(url: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    request<HTMLImageElement>(url, { type: "image" }).then((image) => {
      createImageBitmap(image).then(resolve, reject);
    }, reject);
  });
}
