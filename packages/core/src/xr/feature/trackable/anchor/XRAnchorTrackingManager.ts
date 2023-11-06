import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRPlatformAnchorTracking,
  IXRTrackedAnchor
> {
  addTrackingAnchor(anchor: IXRPose): void;
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

  removeTrackingAnchor(anchor: IXRRequestTrackingAnchor): void;
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
