import { XRSessionType, XRFeatureType, XRInputType, request, IXRImageTrackingDescriptor } from "@galacean/engine";
import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { WebXRDevice } from "./WebXRDevice";

export function generateUUID(): number {
  return ++WebXRDevice._uuid;
}

export function parseXRMode(mode: XRSessionType): XRSessionMode {
  switch (mode) {
    case XRSessionType.AR:
      return "immersive-ar";
    case XRSessionType.VR:
      return "immersive-vr";
    default:
      return null;
  }
}

export function parseFeature(descriptor: IXRFeatureDescriptor, options: XRSessionInit): Promise<void> | void {
  const { requiredFeatures } = options;
  switch (descriptor.type) {
    case XRFeatureType.ImageTracking:
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
    case XRFeatureType.HitTest:
    case XRFeatureType.PlaneTracking:
      requiredFeatures.push("plane-detection");
      break;
    case XRFeatureType.AnchorTracking:
      requiredFeatures.push("anchors");
      break;
  }
}

export function getInputSource(inputSource: XRInputSource): XRInputType {
  let type: XRInputType;
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

export function viewToCamera(type: XREye): XRInputType {
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
