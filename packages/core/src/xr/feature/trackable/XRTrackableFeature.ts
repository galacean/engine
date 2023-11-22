import {
  IXRFrame,
  IXRSession,
  IXRTracked,
  IXRFeatureConfig,
  IXRRequestTracking,
  IXRTrackableFeature
} from "@galacean/engine-design";
import { XRTrackedUpdateFlag } from "../../input/XRTrackedUpdateFlag";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRFeature } from "../XRFeature";
import { XRTrackingState } from "../../input/XRTrackingState";
import { XRRequestTrackingState } from "./XRRequestTrackingState";
import { XRSessionManager } from "../../session/XRSessionManager";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableFeature<
  TDescriptor extends IXRFeatureConfig,
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>,
  TTrackableFeature extends IXRTrackableFeature<TXRTracked, TXRRequestTracking>
> extends XRFeature<TDescriptor, TTrackableFeature> {
  protected _sessionManager: XRSessionManager;
  protected _requestTrackings: TXRRequestTracking[] = [];
  protected _trackedObjects: TXRTracked[] = [];
  protected _added: TXRTracked[] = [];
  protected _updated: TXRTracked[] = [];
  protected _removed: TXRTracked[] = [];
  protected _statusSnapshot: Record<number, XRTrackingState> = {};
  private _trackedUpdateFlag: UpdateFlagManager = new UpdateFlagManager();

  /**
   * Return Request tracking requirements.
   */
  get requestTrackings(): readonly TXRRequestTracking[] {
    return this._requestTrackings;
  }

  /**
   * Returns the tracked objects.
   */
  get trackedObjects(): readonly TXRTracked[] {
    return this._trackedObjects;
  }

  /**
   * Add a listening function to track changes.
   * @param listener - The listening function
   */
  addListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTracked[]) => any): void {
    this._trackedUpdateFlag.addListener(listener);
  }

  /**
   * Remove a listening function to track changes.
   * @param listener - The listening function
   */
  removeListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTracked[]) => any): void {
    this._trackedUpdateFlag.removeListener(listener);
  }

  override onUpdate(session: IXRSession, frame: IXRFrame): void {
    const {
      _platformFeature: platformFeature,
      _trackedUpdateFlag: trackedUpdateFlag,
      _requestTrackings: requestTrackings,
      _statusSnapshot: statusSnapshot,
      _added: added,
      _updated: updated,
      _removed: removed
    } = this;
    if (!session || !frame || !requestTrackings.length) {
      return;
    }
    if (!platformFeature.checkAvailable(session, frame, requestTrackings)) {
      return;
    }
    added.length = updated.length = removed.length = 0;
    platformFeature.getTrackedResult(session, frame, requestTrackings);
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.state !== XRRequestTrackingState.Resolved) {
        continue;
      }
      const { tracked } = requestTracking;
      for (let j = 0, n = tracked.length; j < n; j++) {
        const trackedObject = tracked[j];
        const trackId = trackedObject.id;
        if (trackedObject.state === XRTrackingState.Tracking) {
          if (statusSnapshot[trackId] === XRTrackingState.Tracking) {
            updated.push(trackedObject);
          } else {
            added.push(trackedObject);
            statusSnapshot[trackId] = XRTrackingState.Tracking;
          }
        } else {
          if (statusSnapshot[trackId] === XRTrackingState.Tracking) {
            removed.push(trackedObject);
          }
          statusSnapshot[trackId] = trackedObject.state;
        }
      }
    }
    added.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Added, added);
    updated.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Updated, updated);
    removed.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Removed, removed);
  }

  override onSessionStop(): void {
    this._added.length = this._updated.length = this._removed.length = 0;
  }

  override onSessionDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  override onDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  protected _addRequestTracking(requestTracking: TXRRequestTracking): void {
    if (!this._canModifyRequestTracking()) {
      throw new Error("Request tracking cannot be modified after XR session initialization.");
    }
    this._requestTrackings.push(requestTracking);
    this._platformFeature.onAddRequestTracking && this._platformFeature.onAddRequestTracking(requestTracking);
  }

  protected _removeRequestTracking(requestTracking: TXRRequestTracking): void {
    if (!this._canModifyRequestTracking()) {
      throw new Error("Request tracking cannot be modified after XR session initialization.");
    }
    const { _requestTrackings: requestTrackings } = this;
    const lastIndex = requestTrackings.length - 1;
    const index = requestTrackings.indexOf(requestTracking);
    if (index >= 0) {
      index !== lastIndex && (requestTrackings[index] = requestTrackings[lastIndex]);
      requestTrackings.length = lastIndex;
      this._platformFeature.onDeleteRequestTracking && this._platformFeature.onDeleteRequestTracking(requestTracking);
    }
  }

  protected _removeAllRequestTrackings(): void {
    if (!this._canModifyRequestTracking()) {
      throw new Error("Request tracking cannot be modified after XR session initialization.");
    }
    const { _requestTrackings: requestTrackings, _platformFeature: platformFeature } = this;
    if (platformFeature.onDeleteRequestTracking) {
      for (let i = 0, n = requestTrackings.length; i < n; i++) {
        platformFeature.onDeleteRequestTracking(requestTrackings[i]);
      }
    }
    requestTrackings.length = 0;
  }

  private _canModifyRequestTracking(): boolean {
    return !this._sessionManager.session || this._platformFeature.canModifyRequestTrackingAfterInit;
  }
}
