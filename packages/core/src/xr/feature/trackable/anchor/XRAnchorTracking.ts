import { Quaternion, Vector3 } from "@galacean/engine-math";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRRequestAnchor } from "./XRRequestAnchor";
import { XRTrackedAnchor } from "./XRTrackedAnchor";

/**
 * The manager of XR anchor tracking.
 */
@registerXRFeature(XRFeatureType.AnchorTracking)
export class XRAnchorTracking extends XRTrackableFeature<XRTrackedAnchor, XRRequestAnchor> {
  /**
   * The anchors to tracking.
   */
  get requestAnchors(): readonly XRRequestAnchor[] {
    return this._requestTrackings;
  }

  /**
   * The tracked anchors.
   */
  get trackedAnchors(): readonly XRTrackedAnchor[] {
    return this._tracked;
  }

  /**
   * @param xrManager - The xr manager
   */
  constructor(xrManager: XRManager) {
    super(xrManager, XRFeatureType.AnchorTracking);
  }

  /**
   * Add a anchor in XR space.
   * @param anchor - The anchor to be added
   */
  addAnchor(position: Vector3, rotation: Quaternion): XRRequestAnchor {
    if (!this._enabled) {
      throw new Error("Cannot add an anchor from a disabled anchor manager.");
    }
    const requestAnchor = new XRRequestAnchor(position, rotation);
    requestAnchor.tracked = [new XRTrackedAnchor()];
    this._addRequestTracking(requestAnchor);
    return requestAnchor;
  }

  /**
   * Remove a anchor in XR space.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: XRRequestAnchor): void {
    if (!this._enabled) {
      throw new Error("Cannot remove an anchor from a disabled anchor manager.");
    }
    const { _requestTrackings: requestTrackings } = this;
    requestTrackings.splice(requestTrackings.indexOf(anchor), 1);
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
