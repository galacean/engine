import { request } from "@galacean/engine";
import { IXRFeatureDescriptor, IXRImageTrackingDescriptor } from "@galacean/engine-design";
import { WebXRDevice } from "./WebXRDevice";

export function generateUUID(): number {
  return ++WebXRDevice._uuid;
}

export function parseXRMode(mode: number): XRSessionMode {
  switch (mode) {
    // XRSessionType.AR
    case 0:
      return "immersive-ar";
    // XRSessionType.VR
    case 1:
      return "immersive-vr";
    default:
      return null;
  }
}

export function parseFeature(descriptor: IXRFeatureDescriptor, options: XRSessionInit): Promise<void> | void {
  const { requiredFeatures } = options;
  switch (descriptor.type) {
    // XRFeatureType.AnchorTracking
    case 2:
      requiredFeatures.push("anchors");
      break;
    // XRFeatureType.ImageTracking
    case 3:
      requiredFeatures.push("image-tracking");
      const { images } = <IXRImageTrackingDescriptor>descriptor;
      const promiseArr: Promise<ImageBitmap>[] = [];
      if (images) {
        for (let i = 0, n = images.length; i < n; i++) {
          const referenceImage = images[i];
          const { src } = images[i];
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
                widthInMeters: images[i].physicalWidth ?? bitmap.width / 100
              });
            }
            resolve();
          }, reject);
        });
      } else {
        return Promise.reject(new Error("Images.length is 0"));
      }
    // XRFeatureType.PlaneTracking
    case 4:
    // XRFeatureType.HitTest
    case 5:
      requiredFeatures.push("plane-detection");
      break;
  }
}

export function getInputSource(inputSource: XRInputSource): number {
  let type: number;
  switch (inputSource.targetRayMode) {
    case "gaze":
      break;
    case "screen":
      // XRInputType.Controller
      return 0;
    case "tracked-pointer":
      if (inputSource.hand) {
        switch (inputSource.handedness) {
          case "left":
            // XRInputType.LeftHand
            return 6;
          case "right":
            // XRInputType.RightHand
            return 7;
        }
      } else {
        switch (inputSource.handedness) {
          case "left":
            // XRInputType.LeftController
            return 1;
          case "right":
            // XRInputType.RightController
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
      // XRInputType.LeftCamera
      return 4;
    case "right":
      // XRInputType.RightCamera
      return 5;
    default:
      // XRInputType.Camera
      return 3;
  }
}

function createImageBitmapByURL(url: string): Promise<ImageBitmap> {
  return request<HTMLImageElement>(url, { type: "image" }).then((image) => createImageBitmap(image));
}
