import { IXRRequestAnchorTracking, IXRTracked } from "@galacean/engine-design";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRPose } from "../../../XRPose";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRAnchor } from "./XRAnchor";

/**
 * The manager of XR anchor tracking.
 */
@registerXRFeature(XRFeatureType.AnchorTracking)
export class XRAnchorTracking extends XRTrackableFeature<IXRTracked, IXRRequestAnchorTracking> {
  private _anchors: XRAnchor[];

  /**
   * The anchors to be tracked.
   */
  get anchors(): readonly XRAnchor[] {
    return this._anchors;
  }

  /**
   * @param xrManager - The xr manager
   * @param anchors - The anchors to be tracked
   */
  constructor(xrManager: XRManager, anchors: XRAnchor[] = []) {
    super(xrManager, XRFeatureType.AnchorTracking);
    this._anchors = anchors;
    for (let i = 0, n = anchors.length; i < n; i++) {
      this._addRequestTracking({
        anchor: anchors[i],
        state: XRRequestTrackingState.None,
        tracked: []
      });
    }
  }

  /**
   * Add a tracking anchor in XR space.
   * @param anchor - The anchor to be added
   */
  addAnchor(anchor: XRAnchor): void {
    if (!this._enabled) {
      throw new Error("Cannot add an anchor from a disabled anchor manager.");
    }
    const requestTracking = {
      anchor,
      state: XRRequestTrackingState.None,
      tracked: []
    };
    this._addRequestTracking(requestTracking);
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: XRAnchor): void {
    if (!this._enabled) {
      throw new Error("Cannot remove an anchor from a disabled anchor manager.");
    }
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.anchor === anchor) {
        this._removeRequestTracking(requestTracking);
        return;
      }
    }
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
