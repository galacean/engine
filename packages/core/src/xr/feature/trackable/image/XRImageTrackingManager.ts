import { registerXRFeatureManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRReferenceImage } from "./XRReferenceImage";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRTrackedImage } from "@galacean/engine-design";
import { XRPlatformImageTracking } from "./XRPlatformImageTracking";
import { XRSessionState } from "../../../session/XRSessionState";
import { XRImage } from "../../../component/trackable/XRImage";
import { Logger } from "../../../../base";

@registerXRFeatureManager(XRFeatureType.ImageTracking)
/**
 * The manager of XR image tracking.
 */
export class XRImageTrackingManager extends XRTrackableManager<
  IXRImageTrackingDescriptor,
  XRPlatformImageTracking,
  IXRTrackedImage,
  XRImage
> {
  /**
   * Add a tracking image
   * @param image - xr reference image
   */
  addTrackingImage(image: XRReferenceImage): void;

  /**
   * Add tracking images
   * @param images - xr reference images
   */
  addTrackingImage(images: XRReferenceImage[]): void;

  addTrackingImage(imageOrArr: XRReferenceImage | XRReferenceImage[]): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be added when the session is not initialized.");
      return;
    }
    if (imageOrArr instanceof Array) {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        platformFeature._addSingleImage(imageOrArr[i]);
      }
    } else {
      this._platformFeature._addSingleImage(imageOrArr);
    }
  }

  /**
   * Remove a tracking image
   * @param image - xr reference image
   */
  removeTrackingImage(image: XRReferenceImage): void;

  /**
   * Remove tracking images
   * @param images - xr reference images
   */
  removeTrackingImage(images: XRReferenceImage[]): void;

  removeTrackingImage(imageOrArr: XRReferenceImage | XRReferenceImage[]): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be removed when the session is not initialized.");
      return;
    }
    if (imageOrArr instanceof XRReferenceImage) {
      this._platformFeature._removeSingleImage(imageOrArr);
    } else {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        platformFeature._removeSingleImage(imageOrArr[i]);
      }
    }
  }

  /**
   * Remove all tracking images
   */
  removeAllTrackingImage(): void {
    if (this._engine.xrManager.sessionManager.state !== XRSessionState.None) {
      Logger.warn("Tracking images can only be removed when the session is not initialized.");
      return;
    }
    this._platformFeature._removeAllImages();
  }
}
