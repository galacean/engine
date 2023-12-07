import { IXRRequestTracking, IXRTrackablePlatformFeature, IXRTracked } from "@galacean/engine-design";
import { XRTrackingState } from "../../input/XRTrackingState";
import { XRFeature } from "../XRFeature";
import { XRRequestTrackingState } from "./XRRequestTrackingState";
import { XRFeatureType } from "../XRFeatureType";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableFeature<
  T extends IXRTracked,
  K extends IXRRequestTracking<T>
> extends XRFeature<IXRTrackablePlatformFeature> {
  protected _requestTrackings: K[] = [];
  protected _trackedObjects: T[] = [];
  protected _added: T[] = [];
  protected _updated: T[] = [];
  protected _removed: T[] = [];
  protected _statusSnapshot: Record<number, XRTrackingState> = {};
  private _listeners: ((added: readonly T[], updated: readonly T[], removed: readonly T[]) => void)[] = [];

  /**
   * Return Request tracking requirements.
   */
  get requestTrackings(): readonly K[] {
    return this._requestTrackings;
  }

  /**
   * Returns the tracked objects.
   */
  get trackedObjects(): readonly T[] {
    return this._trackedObjects;
  }

  /**
   * Add a listening function for tracked object changes.
   * @param listener - The listening function
   */
  addTrackedObjectChangedListener(
    listener: (added: readonly T[], updated: readonly T[], removed: readonly T[]) => void
  ): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a listening function of tracked object changes.
   * @param listener - The listening function
   */
  removeTrackedObjectChangedListener(
    listener: (added: readonly T[], updated: readonly T[], removed: readonly T[]) => void
  ): void {
    const { _listeners: listeners } = this;
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }

  override _onUpdate(): void {
    const { _platformSession: platformSession } = this._xrManager.sessionManager;
    const { frame: platformFrame } = platformSession;
    const {
      _platformFeature: platformFeature,
      _listeners: listeners,
      _requestTrackings: requestTrackings,
      _statusSnapshot: statusSnapshot,
      _added: added,
      _updated: updated,
      _removed: removed
    } = this;
    if (!platformFrame || !requestTrackings.length) {
      return;
    }
    if (!platformFeature.checkAvailable(platformSession, platformFrame, requestTrackings)) {
      return;
    }
    added.length = updated.length = removed.length = 0;
    platformFeature.getTrackedResult(platformSession, platformFrame, requestTrackings);
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
    if (added.length > 0 || updated.length > 0 || removed.length > 0) {
      for (let i = 0, n = listeners.length; i < n; i++) {
        listeners[i](added, updated, removed);
      }
    }
  }

  override _onSessionStop(): void {
    this._added.length = this._updated.length = this._removed.length = 0;
  }

  override _onSessionExit(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  override _onDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  protected _addRequestTracking(requestTracking: K): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    this._requestTrackings.push(requestTracking);
    platformFeature.onAddRequestTracking && platformFeature.onAddRequestTracking(requestTracking);
  }

  protected _removeRequestTracking(requestTracking: K): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    const { _requestTrackings: requestTrackings } = this;
    const lastIndex = requestTrackings.length - 1;
    const index = requestTrackings.indexOf(requestTracking);
    if (index >= 0) {
      index !== lastIndex && (requestTrackings[index] = requestTrackings[lastIndex]);
      requestTrackings.length = lastIndex;
      platformFeature.onDelRequestTracking && platformFeature.onDelRequestTracking(requestTracking);
    }
  }

  protected _removeAllRequestTrackings(): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    const { _requestTrackings: requestTrackings } = this;
    if (platformFeature.onDelRequestTracking) {
      for (let i = 0, n = requestTrackings.length; i < n; i++) {
        platformFeature.onDelRequestTracking(requestTrackings[i]);
      }
    }
    requestTrackings.length = 0;
  }
}
