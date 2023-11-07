import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRPlatformAnchorTracking,
  IXRTrackedAnchor
> {
  /**
   * Add a tracking anchor.
   * @param anchor - The anchor to be added
   */
  addTrackingAnchor(anchor: IXRPose): void;

  /**
   * Add tracking anchors.
   * @param anchors - The anchors to be added
   */
  addTrackingAnchor(anchors: IXRPose[]): void;

  addTrackingAnchor(anchorOrArr: IXRPose | IXRPose[]): void {
    if (anchorOrArr instanceof Array) {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = anchorOrArr.length; i < n; i++) {
        platformFeature._addSingleAnchor(anchorOrArr[i]);
      }
    } else {
      this._platformFeature._addSingleAnchor(anchorOrArr);
    }
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeTrackingAnchor(anchor: IXRRequestTrackingAnchor): void;

  /**
   * Remove tracking anchors.
   * @param anchors - The anchors to be removed
   */
  removeTrackingAnchor(anchors: IXRRequestTrackingAnchor[]): void;

  removeTrackingAnchor(anchorOrArr: IXRRequestTrackingAnchor | IXRRequestTrackingAnchor[]): void {
    if (anchorOrArr instanceof Array) {
      const { _platformFeature: platformFeature } = this;
      for (let i = 0, n = anchorOrArr.length; i < n; i++) {
        platformFeature._removeSingleAnchor(anchorOrArr[i]);
      }
    } else {
      this._platformFeature._removeSingleAnchor(anchorOrArr);
    }
  }
}
