import {
  IXRFeatureDescriptor,
  IXRFrame,
  IXRRequestTracking,
  IXRSession,
  IXRTrackableFeature,
  IXRTracked
} from "@galacean/engine-design";
import { XRTrackedUpdateFlag } from "../../input/XRTrackedUpdateFlag";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRTrackingState } from "../../input/XRTrackingState";
import { XRRequestTrackingState } from "./XRRequestTrackingState";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>,
  TTrackableFeature extends IXRTrackableFeature<TXRTracked, TXRRequestTracking>
> extends XRFeatureManager<TDescriptor, TTrackableFeature> {
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

  addRequestTracking(add: TXRRequestTracking): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.equals(add)) {
        return;
      }
    }
    requestTrackings.push(add);
    // this._onRequestTrackingAdded(add);
  }

  removeRequestTracking(remove: TXRRequestTracking): void {
    const { _requestTrackings: requestTrackings } = this;
    const lastIndex = requestTrackings.length - 1;
    for (let i = 0; i <= lastIndex; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.equals(remove)) {
        i !== lastIndex && (requestTrackings[i] = requestTrackings[lastIndex]);
        requestTrackings.length = lastIndex;
        // this._onRequestTrackingRemoved(remove);
        return;
      }
    }
  }

  removeAllRequestTrackings(): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      // this._onRequestTrackingRemoved(requestTrackings[i]);
    }
    this._requestTrackings.length = 0;
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
      _feature: feature,
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
    if (!feature.checkAvailable(session, frame, requestTrackings)) {
      return;
    }
    added.length = updated.length = removed.length = 0;
    // @ts-ignore
    feature.getTrackedResult();
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
}
