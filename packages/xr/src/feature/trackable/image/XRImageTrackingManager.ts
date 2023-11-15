import { Logger, XRFeatureType, XRSessionState, registerXRFeatureManager } from "@galacean/engine";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRPlatformImageTracking } from "./XRPlatformImageTracking";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRTrackedImage } from "./XRTrackedImage";

@registerXRFeatureManager(XRFeatureType.ImageTracking)
/**
 * The manager of XR image tracking.
 */
export class XRImageTrackingManager extends XRTrackableManager<
  IXRImageTrackingDescriptor,
  XRTrackedImage,
  XRPlatformImageTracking
> {
  private _referenceImages: XRReferenceImage[] = [];

  /**
   * Add a tracking image
   * @param image - xr reference image
   */
  addImage(image: XRReferenceImage): void;

  /**
   * Add tracking images
   * @param images - xr reference images
   */
  addImage(images: XRReferenceImage[]): void;

  addImage(imageOrArr: XRReferenceImage | XRReferenceImage[]): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be added when the session is not initialized.");
      return;
    }
    if (imageOrArr instanceof Array) {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        platformFeature._addImage(imageOrArr[i]);
      }
    } else {
      this._platformFeature._addImage(imageOrArr);
    }
  }

  /**
   * Remove a tracking image
   * @param image - xr reference image
   */
  removeImage(image: XRReferenceImage): void;

  /**
   * Remove tracking images
   * @param images - xr reference images
   */
  removeImage(images: XRReferenceImage[]): void;

  removeImage(imageOrArr: XRReferenceImage | XRReferenceImage[]): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be removed when the session is not initialized.");
      return;
    }
    if (imageOrArr instanceof XRReferenceImage) {
      this._platformFeature._removeImage(imageOrArr);
    } else {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        platformFeature._removeImage(imageOrArr[i]);
      }
    }
  }

  /**
   * Remove all tracking images
   */
  removeAllImages(): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be removed when the session is not initialized.");
      return;
    }
    this._platformFeature._removeAllImages();
  }
}
