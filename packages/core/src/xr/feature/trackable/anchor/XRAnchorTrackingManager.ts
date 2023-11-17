import { IXRAnchorTracking, IXRPose } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRRequestTrackingAnchor } from "./XRRequestTrackingAnchor";
import { XRTracked } from "../XRTracked";
import { XRFeatureType } from "../../XRFeatureType";
import { registerXRFeatureManager } from "../../../XRManager";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRTracked,
  XRRequestTrackingAnchor,
  IXRAnchorTracking
> {
  /**
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): XRRequestTrackingAnchor {
    const requestTracking = new XRRequestTrackingAnchor(pose);
    this.addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(pose: IXRPose): void {
    this.removeRequestTracking(new XRRequestTrackingAnchor(pose));
  }

  /**
   * Remove all tracking anchors.
   */
  removeAllAnchors(): void {
    this.removeAllRequestTrackings();
  }

  override initialize(): Promise<void> {
    const { anchors } = this._descriptor;
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this.addRequestTracking(new XRRequestTrackingAnchor(anchors[i]));
      }
    }
    return Promise.resolve();
  }
}
