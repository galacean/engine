import { IXRFeatureDescriptor, IXRRequestTracking, IXRTracked } from "@galacean/engine-design";
import {
  XRFeatureManager,
  XRTrackedUpdateFlag,
  UpdateFlagManager,
  Entity,
  Component,
  XRFeatureType
} from "@galacean/engine";
import { XRTrackablePlatformFeature } from "./XRTrackablePlatformFeature";
import { XRTrackedComponent } from "../../component/trackable/XRTrackedComponent";

type TTrackedComponent = new (entity: Entity) => Component;
/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TXRTracked extends IXRTracked,
  TXRTrackedComponent extends XRTrackedComponent<TXRTracked>,
  TTrackablePlatformFeature extends XRTrackablePlatformFeature<TXRTracked, IXRRequestTracking<TXRTracked>>
> extends XRFeatureManager<TDescriptor, TTrackablePlatformFeature> {
  // @internal
  static _componentMap: TTrackedComponent[] = [];

  private _trackedUpdateFlag: UpdateFlagManager = new UpdateFlagManager();
  private _trackedObjects: TXRTrackedComponent[] = [];
  private _trackIdToIndex: Record<string, number> = {};
  private _prefab: Entity;
  private _added: TXRTrackedComponent[] = [];
  private _updated: TXRTrackedComponent[] = [];
  private _removed: TXRTrackedComponent[] = [];

  /**
   * Returns the prefab of the tracked object.
   */
  get prefab(): Entity {
    return this._prefab;
  }

  set prefab(value: Entity) {
    this._prefab = value;
  }

  /**
   * Returns the tracked objects.
   */
  get trackedObjects(): readonly TXRTrackedComponent[] {
    return this._trackedObjects;
  }

  /**
   * Returns the added tracked objects.
   * @param id - The id of the tracked object
   * @returns The tracked object
   */
  getTrackedObjectByID(id: number): TXRTrackedComponent {
    const index = this._trackIdToIndex[id];
    return index !== undefined ? this._trackedObjects[index] : null;
  }

  /**
   * Add a listening function to track changes.
   * @param listener - The listening function
   */
  addListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTrackedComponent[]) => any): void {
    this._trackedUpdateFlag.addListener(listener);
  }

  /**
   * Remove a listening function to track changes.
   * @param listener - The listening function
   */
  removeListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTrackedComponent[]) => any): void {
    this._trackedUpdateFlag.removeListener(listener);
  }

  override onUpdate(): void {
    const { _platformFeature: platformFeature } = this;
    platformFeature._onUpdate();
    const { added, updated, removed } = platformFeature.getChanges();
    const { _added, _updated, _removed } = this;
    _added.length = _updated.length = _removed.length = 0;

    // Update tracked objects based on session data
    const {
      _trackedUpdateFlag: trackedUpdateFlag,
      _trackIdToIndex: trackIdToIndex,
      _trackedObjects: trackedObjects
    } = this;
    if (added.length > 0) {
      for (let i = 0, n = added.length; i < n; i++) {
        const trackedObject = this._createOrUpdateTrackedObject(added[i]);
        trackedObject && _added.push(trackedObject);
      }
    }
    if (updated.length > 0) {
      for (let i = 0, n = updated.length; i < n; i++) {
        const trackedObject = this._createOrUpdateTrackedObject(updated[i]);
        trackedObject && _updated.push(trackedObject);
      }
    }
    if (removed.length > 0) {
      for (let i = 0, n = removed.length; i < n; i++) {
        const { id } = removed[i];
        const index = this._trackIdToIndex[id];
        if (index !== undefined) {
          delete trackIdToIndex[id];
          _removed.push(trackedObjects[index]);
          trackedObjects.splice(index, 1);
        }
      }
    }
    _added.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Added, _added);
    _updated.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Updated, _updated);
    if (_removed.length > 0) {
      trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Removed, _removed);
      for (let i = 0, n = _removed.length; i < n; i++) {
        const trackedObject = _removed[i];
        trackedObject.destroyOnRemoval && trackedObject.entity.destroy();
      }
    }
  }

  private _createOrUpdateTrackedObject(sessionRelativeData: TXRTracked): TXRTrackedComponent {
    const { _trackIdToIndex: trackIdToIndex, _trackedObjects: trackedObjects } = this;
    let trackedObject = this.getTrackedObjectByID(sessionRelativeData.id);
    if (!trackedObject) {
      trackedObject = this._createTrackedObject(sessionRelativeData);
      trackIdToIndex[sessionRelativeData.id] = trackedObjects.length;
      trackedObjects.push(trackedObject);
    }
    trackedObject.platformData = sessionRelativeData;
    // Sync transform
    const { transform } = trackedObject.entity;
    const { pose } = sessionRelativeData;
    transform.position = pose.position;
    transform.rotationQuaternion = pose.rotation;
    return trackedObject;
  }

  private _createTrackedObject(sessionRelativeData: TXRTracked): TXRTrackedComponent {
    const origin = this._engine.xrManager.origin;
    const { _prefab: prefab } = this;
    let entity: Entity;
    if (prefab) {
      entity = prefab.clone();
      entity.name = "trackable" + sessionRelativeData.id;
      origin.addChild(entity);
    } else {
      entity = origin.createChild("trackable" + sessionRelativeData.id);
    }
    const trackedObject = <TXRTrackedComponent>(
      entity.addComponent(XRTrackableManager._componentMap[this._descriptor.type])
    );
    return trackedObject;
  }
}

export function registerXRTrackedComponent(feature: XRFeatureType) {
  return (componentConstructor: TTrackedComponent) => {
    XRTrackableManager._componentMap[feature] = componentConstructor;
  };
}
