import {
  IXRAnchorTracking,
  IXRAnchorTrackingConfig,
  IXRRequestAnchorTracking,
  IXRTracked
} from "@galacean/engine-design";
import { XRManager } from "../../../XRManager";
import { XRPose } from "../../../XRPose";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";

/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTracking extends XRTrackableFeature<
  IXRAnchorTrackingConfig,
  IXRTracked,
  IXRRequestAnchorTracking,
  IXRAnchorTracking
> {
  /**
   * @param xrManager - The xr manager
   * @param anchors - The anchors to be tracked
   */
  constructor(xrManager: XRManager, anchors: XRPose[] = []) {
    super(xrManager);
    this._config = { type: XRFeatureType.AnchorTracking, anchors: [] };
    this._platformFeature = <IXRAnchorTracking>xrManager._platformDevice.createFeature(XRFeatureType.AnchorTracking);
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this._addRequestTracking(this._createRequestTracking(anchors[i]));
      }
    }
  }

  /**
   * Add a tracking anchor in XR space.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: XRPose): IXRRequestAnchorTracking {
    if (!this._enabled) {
      throw new Error("Cannot add an anchor from a disabled anchor manager.");
    }
    const requestTracking = this._createRequestTracking(pose);
    this._addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: IXRRequestAnchorTracking): void {
    if (!this._enabled) {
      throw new Error("Cannot remove an anchor from a disabled anchor manager.");
    }
    this._removeRequestTracking(anchor);
  }

  /**
   * Remove all tracking anchors.
   */
  removeAllAnchors(): void {
    if (!this._enabled) {
      throw new Error("Cannot remove anchors from a disabled anchor manager.");
    }
    this._removeAllRequestTrackings();
  }

  override _generateConfig(): IXRAnchorTrackingConfig {
    const { _config: config, _requestTrackings: requestTrackings } = this;
    const { anchors } = config;
    anchors.length = 0;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      anchors.push(requestTrackings[i].pose);
    }
    return config;
  }

  private _createRequestTracking(pose: XRPose): IXRRequestAnchorTracking {
    return {
      pose,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
