import {
  IXRPose,
  IXRTracked,
  IXRAnchorTracking,
  IXRRequestAnchorTracking,
  IXRAnchorTrackingDescriptor
} from "@galacean/engine-design";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRFeatureType } from "../../XRFeatureType";
import { registerXRFeatureManager } from "../../../XRManager";
import { XRRequestTrackingState } from "../XRRequestTrackingState";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  IXRTracked,
  IXRRequestAnchorTracking,
  IXRAnchorTracking
> {
  /**
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): IXRRequestAnchorTracking {
    const requestTracking = this._createRequestTracking(pose);
    this.addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: IXRRequestAnchorTracking): void {
    this.removeRequestTracking(anchor);
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
        this.addRequestTracking(this._createRequestTracking(anchors[i]));
      }
    }
    return Promise.resolve();
  }

  private _createRequestTracking(pose: IXRPose): IXRRequestAnchorTracking {
    return {
      pose,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
