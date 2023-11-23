import { IXRFeatureConfig, IXRImageTrackingConfig } from "@galacean/engine-design";
import { XRFeatureType, XRInputType, request } from "@galacean/engine";
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
      return XRInputType.Controller;
    case "tracked-pointer":
      if (inputSource.hand) {
        switch (inputSource.handedness) {
          case "left":
            return XRInputType.LeftHand;
          case "right":
            return XRInputType.RightHand;
        }
      } else {
        switch (inputSource.handedness) {
          case "left":
            return XRInputType.LeftController;
          case "right":
            return XRInputType.RightController;
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
      return XRInputType.LeftCamera;
    case "right":
      return XRInputType.RightCamera;
    default:
      return XRInputType.Camera;
  }
}

function createImageBitmapByURL(url: string): Promise<ImageBitmap> {
  return request<HTMLImageElement>(url, { type: "image" }).then((image) => createImageBitmap(image));
}
