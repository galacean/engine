import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRRequestTrackingState } from "../XRRequestTrackingState";

/**
 * The base class of XR anchor tracking.
 */
export abstract class XRPlatformAnchorTracking extends XRTrackablePlatformFeature<IXRTrackedAnchor> {
  protected _requestTrackingAnchors: IXRRequestTrackingAnchor[] = [];
  get requestTrackingAnchors(): readonly IXRRequestTrackingAnchor[] {
    return this._requestTrackingAnchors;
  }

  override _initialize(descriptor: IXRAnchorTrackingDescriptor): Promise<void> {
    this._removeAllAnchors();
    const { anchors } = descriptor;
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this._addSingleAnchor(anchors[i]);
      }
    }
    return Promise.resolve();
  }

  /**
   * @internal
   */
  _addSingleAnchor(pose: IXRPose): void {
    this._requestTrackingAnchors.push({ state: XRRequestTrackingState.None, pose });
  }

  /**
   * @internal
   */
  _removeSingleAnchor(anchor: IXRRequestTrackingAnchor): void {
    this._disposeAnchor(anchor);
    const { _requestTrackingAnchors: requestTrackingAnchors } = this;
    const index = requestTrackingAnchors.indexOf(anchor);
    index >= 0 && requestTrackingAnchors.splice(index, 1);
  }

  /**
   * @internal
   */
  _removeAllAnchors(): void {
    const { _requestTrackingAnchors: requestTrackingAnchors } = this;
    for (let i = 0, n = requestTrackingAnchors.length; i < n; i++) {
      this._disposeAnchor(requestTrackingAnchors[i]);
    }
    requestTrackingAnchors.length = 0;
  }

  protected _disposeAnchor(anchor: IXRRequestTrackingAnchor) {
    anchor.state = XRRequestTrackingState.Destroyed;
    anchor.trackedAnchor = null;
  }
}
