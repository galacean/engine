import { IXRRequestTrackingImage, IXRTrackedImage } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRReferenceImage } from "./XRReferenceImage";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Logger } from "../../../../base";

export abstract class XRPlatformImageTracking extends XRTrackablePlatformFeature<IXRTrackedImage> {
  protected _requestTrackingImages: IXRRequestTrackingImage[] = [];

  get requestTrackingImages(): readonly IXRRequestTrackingImage[] {
    return this._requestTrackingImages;
  }

  override _initialize(descriptor: IXRImageTrackingDescriptor): Promise<void> {
    this._requestTrackingImages.length = 0;
    const { images } = descriptor;
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        this._addSingleImage(images[i]);
      }
    }
    return Promise.resolve();
  }

  /**
   * @internal
   */
  _addSingleImage(image: XRReferenceImage): void {
    const { _requestTrackingImages: requestTrackingImages } = this;
    for (let i = 0, n = requestTrackingImages.length; i < n; i++) {
      if (requestTrackingImages[i].image === image) {
        Logger.warn(image.name, "add repeatedly");
        return;
      }
    }
    requestTrackingImages.push({
      image: image,
      state: XRRequestTrackingState.None
    });
  }

  /**
   * @internal
   */
  _removeSingleImage(image: XRReferenceImage): Promise<void> {
    const { _requestTrackingImages: requestTrackingImages } = this;
    const lastIndex = requestTrackingImages.length - 1;
    for (let i = 0; i <= lastIndex; i++) {
      if (requestTrackingImages[i].image === image) {
        if (i !== lastIndex) {
          requestTrackingImages[i] = requestTrackingImages[lastIndex];
        }
        requestTrackingImages.length = lastIndex;
        return;
      }
    }
    Logger.warn("No image named ", image.name, " exists");
  }

  /**
   * @internal
   */
  _removeAllImages(): void {
    this._requestTrackingImages.length = 0;
  }
}
