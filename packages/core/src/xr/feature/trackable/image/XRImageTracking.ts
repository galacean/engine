import {
  IXRTrackedImage,
  IXRImageTracking,
  IXRImageTrackingConfig,
  IXRRequestImageTracking
} from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRReferenceImage } from "./XRReferenceImage";
import { registerXRFeature } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRSessionState } from "../../../session/XRSessionState";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Logger } from "../../../../base";
import { Engine } from "../../../../Engine";

@registerXRFeature(XRFeatureType.ImageTracking)
/**
 * The manager of XR image tracking.
 */
export class XRImageTracking extends XRTrackableFeature<
  IXRImageTrackingConfig,
  IXRTrackedImage,
  IXRRequestImageTracking,
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
        this.addRequestTracking(this._createRequestTracking(imageOrArr[i]));
      }
    } else {
      this.addRequestTracking(this._createRequestTracking(imageOrArr));
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
      this.removeRequestTracking(this._createRequestTracking(imageOrArr));
    } else {
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        this.removeRequestTracking(this._createRequestTracking(imageOrArr[i]));
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
    const { images } = this._config;
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        this.addRequestTracking(this._createRequestTracking(images[i]));
      }
    }
    return Promise.resolve();
  }

  constructor(engine: Engine) {
    super(engine);
    this._config = {
      type: XRFeatureType.ImageTracking,
      images: []
    };
    this._platformFeature = <IXRImageTracking>engine.xrManager._xrDevice.createFeature(XRFeatureType.ImageTracking);
  }

  private _createRequestTracking(image: XRReferenceImage): IXRRequestImageTracking {
    return {
      image,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
