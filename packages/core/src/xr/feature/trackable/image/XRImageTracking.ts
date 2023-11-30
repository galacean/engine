import {
  IXRTrackedImage,
  IXRImageTracking,
  IXRImageTrackingConfig,
  IXRRequestImageTracking,
  IXRReferenceImage
} from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Engine } from "../../../../Engine";

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
    if (imageOrArr instanceof Array) {
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        this._addRequestTracking(this._createRequestTracking(imageOrArr[i]));
      }
    } else {
      this._addRequestTracking(this._createRequestTracking(imageOrArr));
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
    if (imageOrArr instanceof XRReferenceImage) {
      this._removeRequestTracking(this._createRequestTracking(imageOrArr));
    } else {
      for (let i = 0, n = imageOrArr.length; i < n; i++) {
        this._removeRequestTracking(this._createRequestTracking(imageOrArr[i]));
      }
    }
  }

  /**
   * Remove all tracking images
   */
  removeAllImages(): void {
    this._removeAllRequestTrackings();
  }

  /**
   * @param engine - The engine
   * @param images - The images to be tracked
   */
  constructor(engine: Engine, images: IXRReferenceImage[]) {
    super(engine);
    this._config = { type: XRFeatureType.ImageTracking, images };
    this._platformFeature = <IXRImageTracking>(
      engine.xrManager._platformDevice.createFeature(XRFeatureType.ImageTracking)
    );
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        this._addRequestTracking(this._createRequestTracking(images[i]));
      }
    }
  }

  override _generateConfig(): IXRImageTrackingConfig {
    const { _config: config, _requestTrackings: requestTrackings } = this;
    const { images } = config;
    images.length = 0;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      images.push(requestTrackings[i].image);
    }
    return config;
  }

  private _createRequestTracking(image: XRReferenceImage): IXRRequestImageTracking {
    return {
      image,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
