import { XRFeatureType, XRTrackedInputDevice, request } from "@galacean/engine";
import { IXRFeatureConfig, IXRImageTrackingConfig } from "@galacean/engine-design";
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

export function parseFeature(config: IXRFeatureConfig, options: XRSessionInit): Promise<void> | void {
  const { requiredFeatures } = options;
  switch (config.type) {
    case XRFeatureType.AnchorTracking:
      requiredFeatures.push("anchors");
      break;
    case XRFeatureType.ImageTracking:
      requiredFeatures.push("image-tracking");
      const { images } = <IXRImageTrackingConfig>config;
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
    case XRFeatureType.PlaneTracking:
    case XRFeatureType.HitTest:
      if (requiredFeatures.indexOf("plane-detection") < 0) {
        requiredFeatures.push("plane-detection");
      }
      break;
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

function createImageBitmapByURL(url: string): Promise<ImageBitmap> {
  return request<HTMLImageElement>(url, { type: "image" }).then((image) => createImageBitmap(image));
}
