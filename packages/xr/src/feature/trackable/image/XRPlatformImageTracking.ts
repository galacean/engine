import { IXRRequestTrackingImage, IXRTrackedImage } from "@galacean/engine-design";
import { Logger } from "@galacean/engine";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRReferenceImage } from "./XRReferenceImage";

/**
 * The base class of XR image tracking.
 */
export abstract class XRPlatformImageTracking extends XRTrackablePlatformFeature<
  IXRTrackedImage,
  IXRRequestTrackingImage
> {
  override _initialize(descriptor: IXRImageTrackingDescriptor): Promise<void> {
    this._requestTrackings.length = 0;
    const { images } = descriptor;
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        this._addImage(images[i]);
      }
    }
    return Promise.resolve();
  }

  /**
   * @internal
   */
  _addImage(image: XRReferenceImage): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      if (requestTrackings[i].image === image) {
        Logger.warn(image.name, "add repeatedly");
        return;
      }
    }
    requestTrackings.push({
      image: image,
      state: XRRequestTrackingState.None,
      tracked: []
    });
  }

  /**
   * @internal
   */
  _removeImage(image: XRReferenceImage): Promise<void> {
    const { _requestTrackings: requestTrackings } = this;
    const lastIndex = requestTrackings.length - 1;
    for (let i = 0; i <= lastIndex; i++) {
      const requestTrackingImage = requestTrackings[i];
      if (requestTrackingImage.image === image) {
        i !== lastIndex && (requestTrackings[i] = requestTrackings[lastIndex]);
        this._disposeImage(requestTrackingImage);
        requestTrackings.length = lastIndex;
        return;
      }
    }
    Logger.warn("No image named ", image.name, " exists");
  }

  /**
   * @internal
   */
  _removeAllImages(): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      this._disposeImage(requestTrackings[i]);
    }
    this._requestTrackings.length = 0;
  }

  protected _disposeImage(image: IXRRequestTrackingImage): void {
    image.state = XRRequestTrackingState.Destroyed;
    image.tracked.length = 0;
  }
}
