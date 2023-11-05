import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRRequestTrackingState } from "../XRRequestTrackingState";

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
        this._requestTrackingAnchors.push({ state: XRRequestTrackingState.None, pose: anchors[i] });
      }
    }
    return Promise.resolve();
  }

  _addSingleAnchor(pose: IXRPose): void {
    this._requestTrackingAnchors.push({ state: XRRequestTrackingState.None, pose });
  }

  _removeSingleAnchor(anchor: IXRRequestTrackingAnchor): void {
    anchor.dispose && anchor.dispose(anchor);
    const { _requestTrackingAnchors: requestTrackingAnchors } = this;
    const index = requestTrackingAnchors.indexOf(anchor);
    index >= 0 && requestTrackingAnchors.splice(index, 1);
  }

  _removeAllAnchors(): void {
    const { _requestTrackingAnchors: requestTrackingAnchors } = this;
    for (let i = 0, n = requestTrackingAnchors.length; i < n; i++) {
      const anchor = requestTrackingAnchors[i];
      anchor.dispose && anchor.dispose(anchor);
    }
    requestTrackingAnchors.length = 0;
  }
}
