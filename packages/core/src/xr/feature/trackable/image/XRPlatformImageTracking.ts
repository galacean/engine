import { Logger } from "../../../../base";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRRequestTrackingImage } from "./XRRequestTrackingImage";
import { XRTrackedImage } from "./XRTrackedImage";

/**
 * The base class of XR image tracking.
 */
export abstract class XRPlatformImageTracking extends XRTrackablePlatformFeature<
  XRTrackedImage,
  XRRequestTrackingImage
> {
  override _initialize(descriptor: IXRImageTrackingDescriptor): Promise<void> {
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
  _addImage(image: XRReferenceImage): XRRequestTrackingImage {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i <= n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.image === image) {
        Logger.warn("Add image[" + image.name + "] repeatedly.");
        return requestTracking;
      }
    }
    const requestTracking = new XRRequestTrackingImage(image);
    this.addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * @internal
   */
  _removeImage(image: XRReferenceImage): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i <= n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.image === image) {
        this.removeRequestTracking(requestTracking);
        return;
      }
    }
    Logger.warn("No image named ", image.name, " exists");
  }

  /**
   * @internal
   */
  _removeAllImages(): void {
    this.removeAllRequestTrackings();
  }
}
