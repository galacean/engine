import { IXRFeatureDescriptor, IXRTrackable } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "./XRTrackablePlatformFeature";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "./XRTrackedUpdateFlag";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRTracked } from "../../component/trackable/XRTracked";
import { XRModule } from "../../XRModule";
import { Entity } from "../../../Entity";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TTrackablePlatformFeature extends XRTrackablePlatformFeature<TXRTrackable>,
  TXRTrackable extends IXRTrackable,
  TXRTracked extends XRTracked<TXRTrackable>
> extends XRFeatureManager<TDescriptor, TTrackablePlatformFeature> {
  private _trackedUpdate: UpdateFlagManager = new UpdateFlagManager();
  private _trackedObjects: TXRTracked[] = [];
  private _trackIdToIndex: Record<string, number> = {};
  private _prefab: Entity;

  private _added: TXRTracked[] = [];
  private _updated: TXRTracked[] = [];
  private _removed: TXRTracked[] = [];

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
  get trackedObjects(): readonly TXRTracked[] {
    return this._trackedObjects;
  }

  /**
   * Returns the added tracked objects.
   * @param id - The id of the tracked object
   * @returns The tracked object
   */
  getTrackedObjectByID(id: number): TXRTracked {
    const index = this._trackIdToIndex[id];
    return index !== undefined ? this._trackedObjects[index] : null;
  }

  /**
   * Add a listening function to track changes.
   * @param listener - The listening function
   */
  addListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTracked[]) => any): void {
    this._trackedUpdate.addListener(listener);
  }

  /**
   * Remove a listening function to track changes.
   * @param listener - The listening function
   */
  removeListener(listener: (type: XRTrackedUpdateFlag, param: readonly TXRTracked[]) => any): void {
    this._trackedUpdate.removeListener(listener);
  }

  override _onUpdate(): void {
    const { _platformFeature: platformFeature } = this;
    platformFeature._onUpdate();
    const { added, updated, removed } = platformFeature.getChanges();
    const { _added, _updated, _removed } = this;
    _added.length = _updated.length = _removed.length = 0;

    // Update tracked objects based on session data
    const { _trackedUpdate: trackedUpdate, _trackIdToIndex: trackIdToIndex, _trackedObjects: trackedObjects } = this;
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
    _added.length > 0 && trackedUpdate.dispatch(XRTrackedUpdateFlag.Added, _added);
    _updated.length > 0 && trackedUpdate.dispatch(XRTrackedUpdateFlag.Updated, _updated);
    if (_removed.length > 0) {
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Removed, _removed);
      for (let i = 0, n = _removed.length; i < n; i++) {
        const trackedObject = _removed[i];
        trackedObject.destroyOnRemoval && trackedObject.entity.destroy();
      }
    }
  }

  private _createOrUpdateTrackedObject(sessionRelativeData: TXRTrackable): TXRTracked {
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

  private _createTrackedObject(sessionRelativeData: TXRTrackable): TXRTracked {
    const origin = this._engine.xrModule.origin;
    const { _prefab: prefab } = this;
    let entity: Entity;
    if (prefab) {
      entity = prefab.clone();
      entity.name = "trackable" + sessionRelativeData.id;
      origin.addChild(entity);
    } else {
      entity = origin.createChild("trackable" + sessionRelativeData.id);
    }
    const trackedObject = <TXRTracked>entity.addComponent(XRModule._componentMap[this._descriptor.type]);
    return trackedObject;
  }
}
