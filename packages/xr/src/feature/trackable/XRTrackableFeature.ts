import { Entity, PrefabResource } from "@galacean/engine";
import { IXRTrackablePlatformFeature } from "@galacean/engine-design";
import { XRTrackedComponent } from "../../component/XRTrackedComponent";
import { XRTrackingState } from "../../input/XRTrackingState";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRRequestTracking } from "./XRRequestTracking";
import { XRRequestTrackingState } from "./XRRequestTrackingState";
import { XRTracked } from "./XRTracked";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableFeature<T extends XRTracked, K extends XRRequestTracking<T>> extends XRFeature<
  IXRTrackablePlatformFeature<T, K>
> {
  protected static _uuid = 0;

  protected _prefab: PrefabResource;
  protected _trackIdToIndex: number[] = [];
  protected _trackedComponents: Array<XRTrackedComponent<T>> = [];
  protected _requestTrackings: K[] = [];
  protected _tracked: T[] = [];
  protected _added: T[] = [];
  protected _updated: T[] = [];
  protected _removed: T[] = [];
  protected _statusSnapshot: Record<number, XRTrackingState> = {};
  private _listeners: ((added: readonly T[], updated: readonly T[], removed: readonly T[]) => void)[] = [];

  get prefab(): PrefabResource {
    return this._prefab;
  }

  set prefab(value: PrefabResource) {
    const lastPrefab = this._prefab;
    if (lastPrefab !== value) {
      // @ts-ignore
      lastPrefab?._addReferCount(-1);
      // @ts-ignore
      value?._addReferCount(1);
      this._prefab = value;
    }
  }

  /**
   * Add a listening function for tracked object changes.
   * @param listener - The listening function
   */
  addChangedListener(listener: (added: readonly T[], updated: readonly T[], removed: readonly T[]) => void): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a listening function of tracked object changes.
   * @param listener - The listening function
   */
  removeChangedListener(listener: (added: readonly T[], updated: readonly T[], removed: readonly T[]) => void): void {
    const { _listeners: listeners } = this;
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }

  /**
   *
   * @param trackId -
   * @returns -
   */
  getTrackedComponentByTrackId(trackId: number): XRTrackedComponent<T> {
    const index = this._trackIdToIndex[trackId];
    return index !== undefined ? this._trackedComponents[index] : undefined;
  }

  override _onUpdate(): void {
    const { _platformSession: platformSession } = this._xrManager.sessionManager;
    const { frame: platformFrame } = platformSession;
    const {
      _platformFeature: platformFeature,
      _listeners: listeners,
      _requestTrackings: requestTrackings,
      _statusSnapshot: statusSnapshot,
      _tracked: allTracked,
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
    platformFeature.getTrackedResult(platformSession, platformFrame, requestTrackings, this._generateTracked);
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      switch (requestTracking.state) {
        case XRRequestTrackingState.Destroyed:
          const destroyedTracked = requestTracking.tracked;
          for (let j = 0, n = destroyedTracked.length; j < n; j++) {
            const tracked = destroyedTracked[j];
            const trackId = tracked.id;
            if (statusSnapshot[trackId] === XRTrackingState.Tracking) {
              removed.push(tracked);
              allTracked.splice(allTracked.indexOf(tracked), 1);
            }
            statusSnapshot[trackId] = XRTrackingState.NotTracking;
          }
          break;
        case XRRequestTrackingState.Resolved:
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
                allTracked.push(trackedObject);
              }
            } else {
              if (statusSnapshot[trackId] === XRTrackingState.Tracking) {
                removed.push(trackedObject);
                allTracked.splice(allTracked.indexOf(trackedObject), 1);
              }
              statusSnapshot[trackId] = trackedObject.state;
            }
          }
          break;
        default:
          break;
      }
    }
    for (let i = requestTrackings.length - 1; i >= 0; i--) {
      requestTrackings[i].state === XRRequestTrackingState.Destroyed && requestTrackings.splice(i, 1);
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
    this._requestTrackings.length = this._tracked.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  override _onDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._tracked.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  protected _addRequestTracking(requestTracking: K): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    this._requestTrackings.push(requestTracking);
    platformFeature.onAddRequestTracking(requestTracking);
  }

  protected _removeRequestTracking(requestTracking: K): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    platformFeature.onDelRequestTracking(requestTracking);
  }

  protected _removeAllRequestTrackings(): void {
    const { _platformFeature: platformFeature } = this;
    if (this._xrManager.sessionManager._platformSession && !platformFeature.canModifyRequestTrackingAfterInit) {
      throw new Error(XRFeatureType[this._type] + " request tracking cannot be modified after initialization.");
    }
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      platformFeature.onDelRequestTracking(requestTrackings[i]);
    }
  }

  protected _onChanged(added: readonly T[], updated: readonly T[], removed: readonly T[]) {
    if (added.length > 0) {
      for (let i = 0, n = added.length; i < n; i++) {
        this._createOrUpdateTrackedComponents(added[i]);
        console.log("add", added[i].id);
      }
    }
    if (updated.length > 0) {
      for (let i = 0, n = updated.length; i < n; i++) {
        this._createOrUpdateTrackedComponents(updated[i]);
        console.log("updated", updated[i].id);
      }
    }
    if (removed.length > 0) {
      const { _trackIdToIndex: trackIdToIndex, _trackedComponents: trackedComponents } = this;
      for (let i = 0, n = removed.length; i < n; i++) {
        const { id } = removed[i];
        console.log("remove", id);
        const index = trackIdToIndex[id];
        if (index !== undefined) {
          const trackedComponent = trackedComponents[index];
          trackedComponents.splice(index, 1);
          delete trackIdToIndex[id];
          if (trackedComponent.destroyedOnRemoval) {
            trackedComponent.entity.destroy();
          } else {
            trackedComponent.entity.parent = null;
          }
        }
      }
    }
  }

  protected _createOrUpdateTrackedComponents(trackedData: T): XRTrackedComponent<T> {
    let trackedComponent = this.getTrackedComponentByTrackId(trackedData.id);
    if (!trackedComponent) {
      const { _trackIdToIndex: trackIdToIndex, _trackedComponents: trackedComponents } = this;
      trackedComponent = this._createTrackedComponents(trackedData);
      trackIdToIndex[trackedData.id] = trackedComponents.length;
      trackedComponents.push(trackedComponent);
    }
    trackedComponent.data = trackedData;
    const { transform } = trackedComponent.entity;
    const { pose } = trackedData;
    transform.position = pose.position;
    transform.rotationQuaternion = pose.rotation;
    return trackedComponent;
  }

  protected _createTrackedComponents(trackedData: T): XRTrackedComponent<T> {
    const { origin } = this._xrManager;
    const { _prefab: prefab } = this;
    let entity: Entity;
    if (prefab) {
      entity = prefab.instantiate();
      entity.name = `TrackedObject${trackedData.id}`;
      origin.addChild(entity);
    } else {
      entity = origin.createChild(`TrackedObject${trackedData.id}`);
    }
    const trackedComponent = entity.addComponent(XRTrackedComponent<T>);
    return trackedComponent;
  }

  protected abstract _generateTracked(): T;
}
