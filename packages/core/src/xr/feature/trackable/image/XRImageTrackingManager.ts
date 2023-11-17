import { IXRImageTracking } from "@galacean/engine-design";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRTrackedImage } from "./XRTrackedImage";
import { registerXRFeatureManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRSessionState } from "../../../session/XRSessionState";
import { Logger } from "../../../../base";
import { XRRequestTrackingImage } from "./XRRequestTrackingImage";

@registerXRFeatureManager(XRFeatureType.ImageTracking)
/**
 * The manager of XR image tracking.
 */
export class XRImageTrackingManager extends XRTrackableManager<
  IXRImageTrackingDescriptor,
  XRTrackedImage,
  XRRequestTrackingImage,
  IXRImageTracking
> {
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
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        this.addRequestTracking(new XRRequestTrackingImage(imageOrArr[i]));
      }
    } else {
      this.addRequestTracking(new XRRequestTrackingImage(imageOrArr));
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
      this.removeRequestTracking(new XRRequestTrackingImage(imageOrArr));
    } else {
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        this.removeRequestTracking(new XRRequestTrackingImage(imageOrArr[i]));
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
    this.removeAllRequestTrackings();
  }

  override initialize(): Promise<void> {
    const { images } = this._descriptor;
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        this.addRequestTracking(new XRRequestTrackingImage(images[i]));
      }
    }
    return Promise.resolve();
  }
}
