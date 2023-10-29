import { IXRFeatureDescriptor, IXRTrackable } from "@galacean/engine-design";
import { XRTrackableFeature } from "./XRTrackableFeature";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "./XRTrackedUpdateFlag";
import { XRFeatureManager } from "../XRFeatureManager";

export class XRTrackableManager<D extends IXRFeatureDescriptor, T extends IXRTrackable> extends XRFeatureManager<D> {
  private _trackables: T[];
  private _idToIdx: Record<number, number> = {};

  private _platformFeature: XRTrackableFeature<T>;
  private _trackedUpdate: UpdateFlagManager = new UpdateFlagManager();

  get trackables(): readonly T[] {
    return this._trackables;
  }

  getTrackable(id: number): T {
    return this._trackables[this._idToIdx[id]];
  }

  override _onFrameUpdate(): void {
    const { added, updated, removed } = this._platformFeature.getChanges();
    const { _trackedUpdate: trackedUpdate, _trackables: trackables, _idToIdx: idToIdx } = this;
    if (added?.length > 0) {
      for (let i = 0, n = added.length; i < n; i++) {
        const trackable = added[i];
        idToIdx[trackable.id] ||= trackables.push(trackable) - 1;
      }
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Added, added);
    }
    if (updated?.length > 0) {
      for (let i = 0, n = updated.length; i < n; i++) {
        const trackable = updated[i];
        idToIdx[trackable.id] ||= trackables.push(trackable) - 1;
      }
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Updated, updated);
    }
    if (removed?.length > 0) {
      for (let i = 0, n = removed.length; i < n; i++) {
        const trackable = removed[i];
        const idx = idToIdx[trackable.id];
        trackables[idx] = null;
        delete idToIdx[trackable.id];
      }
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Removed, removed);
    }
  }
}
