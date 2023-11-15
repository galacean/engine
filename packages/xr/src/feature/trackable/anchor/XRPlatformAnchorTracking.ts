import { IXRPose } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRRequestTrackingAnchor } from "./XRRequestTrackingAnchor";
import { XRTracked } from "../XRTracked";

/**
 * The base class of XR anchor tracking.
 */
export abstract class XRPlatformAnchorTracking extends XRTrackablePlatformFeature<XRTracked, XRRequestTrackingAnchor> {
  override _initialize(descriptor: IXRAnchorTrackingDescriptor): Promise<void> {
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
  _addAnchor(pose: IXRPose): XRRequestTrackingAnchor {
    const requestTracking = new XRRequestTrackingAnchor(pose);
    this.addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * @internal
   */
  _removeAnchor(anchor: XRRequestTrackingAnchor): void {
    this.removeRequestTracking(anchor);
  }

  /**
   * @internal
   */
  _removeAllAnchors(): void {
    this.removeAllRequestTrackings();
  }
}
