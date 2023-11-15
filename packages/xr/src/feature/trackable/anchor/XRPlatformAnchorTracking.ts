import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRRequestTrackingState } from "../XRRequestTrackingState";

/**
 * The base class of XR anchor tracking.
 */
export abstract class XRPlatformAnchorTracking extends XRTrackablePlatformFeature<
  IXRTrackedAnchor,
  IXRRequestTrackingAnchor
> {
  override _initialize(descriptor: IXRAnchorTrackingDescriptor): Promise<void> {
    this._removeAllAnchors();
    const { anchors } = descriptor;
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this._addAnchor(anchors[i]);
      }
    }
    return Promise.resolve();
  }

  /**
   * @internal
   */
  _addAnchor(pose: IXRPose): IXRRequestTrackingAnchor {
    const requestTracking = { state: XRRequestTrackingState.None, pose, tracked: [] };
    this._requestTrackings.push(requestTracking);
    return requestTracking;
  }

  /**
   * @internal
   */
  _removeAnchor(anchor: IXRRequestTrackingAnchor): void {
    this._disposeAnchor(anchor);
    const { _requestTrackings: requestTrackings } = this;
    const index = requestTrackings.indexOf(anchor);
    index >= 0 && requestTrackings.splice(index, 1);
  }

  /**
   * @internal
   */
  _removeAllAnchors(): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      this._disposeAnchor(requestTrackings[i]);
    }
    requestTrackings.length = 0;
  }

  protected _disposeAnchor(anchor: IXRRequestTrackingAnchor) {
    anchor.state = XRRequestTrackingState.Destroyed;
    anchor.tracked.length = 0;
  }
}
