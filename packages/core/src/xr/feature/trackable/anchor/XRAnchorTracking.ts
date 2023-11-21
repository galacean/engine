import {
  IXRPose,
  IXRTracked,
  IXRAnchorTracking,
  IXRAnchorTrackingConfig,
  IXRRequestAnchorTracking
} from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRFeatureType } from "../../XRFeatureType";
import { registerXRFeature } from "../../../XRManager";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Engine } from "../../../../Engine";

@registerXRFeature(XRFeatureType.AnchorTracking)
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
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): IXRRequestAnchorTracking {
    if (!this._enabled) {
      throw new Error("Cannot create an anchor from a disabled anchor manager.");
    }
    const { anchors } = this._config;
    anchors.push(pose);
    const requestTracking = this._createRequestTracking(pose);
    this.addRequestTracking(requestTracking);
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
    this.removeRequestTracking(anchor);
  }

  /**
   * Remove all tracking anchors.
   */
  removeAllAnchors(): void {
    if (!this._enabled) {
      throw new Error("Cannot remove anchors from a disabled anchor manager.");
    }
    this.removeAllRequestTrackings();
  }

  override initialize(): Promise<void> {
    const { anchors } = this._config;
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this.addRequestTracking(this._createRequestTracking(anchors[i]));
      }
    }
    return Promise.resolve();
  }

  constructor(engine: Engine) {
    super(engine);
    this._config = {
      type: XRFeatureType.AnchorTracking,
      anchors: []
    };
    this._platformFeature = <IXRAnchorTracking>engine.xrManager._xrDevice.createFeature(XRFeatureType.AnchorTracking);
  }

  private _createRequestTracking(pose: IXRPose): IXRRequestAnchorTracking {
    return {
      pose,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
