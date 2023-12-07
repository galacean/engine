import { IXRRequestAnchorTracking, IXRTracked } from "@galacean/engine-design";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRPose } from "../../../XRPose";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";

/**
 * The manager of XR anchor tracking.
 */
@registerXRFeature(XRFeatureType.AnchorTracking)
export class XRAnchorTracking extends XRTrackableFeature<IXRTracked, IXRRequestAnchorTracking> {
  private _anchors: XRPose[];

  /**
   * The anchors to be tracked.
   */
  get anchors(): readonly XRPose[] {
    return this._anchors;
  }

  /**
   * @param xrManager - The xr manager
   * @param anchors - The anchors to be tracked
   */
  constructor(xrManager: XRManager, anchors: XRPose[] = []) {
    super(xrManager, XRFeatureType.AnchorTracking);
    this._anchors = anchors;
    for (let i = 0, n = anchors.length; i < n; i++) {
      this._addRequestTracking({
        pose: anchors[i],
        state: XRRequestTrackingState.None,
        tracked: []
      });
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
    const requestTracking = {
      pose,
      state: XRRequestTrackingState.None,
      tracked: []
    };
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
}
