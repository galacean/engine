import {
  IXRPose,
  IXRTracked,
  IXRAnchorTracking,
  IXRAnchorTrackingConfig,
  IXRRequestAnchorTracking
} from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Engine } from "../../../../Engine";

/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTracking extends XRTrackableFeature<
  IXRAnchorTrackingConfig,
  IXRTracked,
  IXRRequestAnchorTracking,
  IXRAnchorTracking
> {
  /**
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): IXRRequestAnchorTracking {
    if (!this._enabled) {
      throw new Error("Cannot add an anchor from a disabled anchor manager.");
    }
    const requestTracking = this._createRequestTracking(pose);
    this._addRequestTracking(requestTracking);
    return requestTracking;
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: IXRRequestAnchorTracking): void {
    if (!this._enabled) {
      throw new Error("Cannot remove an anchor from a disabled anchor manager.");
    }
    this._removeRequestTracking(anchor);
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

  /**
   * @param engine - The engine
   * @param anchors - The anchors to be tracked
   */
  constructor(engine: Engine, anchors: IXRPose[] = []) {
    super(engine);
    this._config = { type: XRFeatureType.AnchorTracking, anchors: [] };
    this._platformFeature = <IXRAnchorTracking>(
      engine.xrManager._platformDevice.createFeature(XRFeatureType.AnchorTracking)
    );
    if (anchors) {
      for (let i = 0, n = anchors.length; i < n; i++) {
        this._addRequestTracking(this._createRequestTracking(anchors[i]));
      }
    }
  }

  override _generateConfig(): IXRAnchorTrackingConfig {
    const { _config: config, _requestTrackings: requestTrackings } = this;
    const { anchors } = config;
    anchors.length = 0;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      anchors.push(requestTrackings[i].pose);
    }
    return config;
  }

  private _createRequestTracking(pose: IXRPose): IXRRequestAnchorTracking {
    return {
      pose,
      state: XRRequestTrackingState.None,
      tracked: []
    };
  }
}
