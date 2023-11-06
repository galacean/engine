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

  override _onSessionDestroy(): void {
    super._onSessionDestroy();
    this._requestTrackingImages.length = 0;
  }

  override _onDestroy(): void {
    super._onDestroy();
    this._requestTrackingImages.length = 0;
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
      const requestTrackingImage = requestTrackingImages[i];
      if (requestTrackingImage.image === image) {
        i !== lastIndex && (requestTrackingImages[i] = requestTrackingImages[lastIndex]);
        this._disposeImage(requestTrackingImage);
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
    const { _requestTrackingImages: requestTrackingImages } = this;
    for (let i = 0, n = requestTrackingImages.length; i < n; i++) {
      this._disposeImage(requestTrackingImages[i]);
    }
    this._requestTrackingImages.length = 0;
  }

  protected _disposeImage(image: IXRRequestTrackingImage): void {
    image.state = XRRequestTrackingState.Destroyed;
    image.trackedImage = null;
  }
}
