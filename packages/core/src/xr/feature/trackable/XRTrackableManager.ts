import { IXRFeatureDescriptor, IXRTrackable } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "./XRTrackablePlatformFeature";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "./XRTrackedUpdateFlag";
import { XRFeatureManager } from "../XRFeatureManager";

type TrackableListener = (type: XRTrackedUpdateFlag, param: readonly IXRTrackable[]) => {};

export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TTrackablePlatformFeature extends XRTrackablePlatformFeature<TXRTrackable>,
  TXRTrackable extends IXRTrackable
> extends XRFeatureManager<TDescriptor, TTrackablePlatformFeature> {
  private _trackables: TXRTrackable[] = [];
  private _trackIdToIndex: Record<number, number> = {};
  private _trackedUpdate: UpdateFlagManager = new UpdateFlagManager();

  get trackables(): readonly TXRTrackable[] {
    return this._trackables;
  }

  getTrackable(trackId: number): TXRTrackable {
    return this._trackables[this._trackIdToIndex[trackId]];
  }

  addListener(listener: TrackableListener) {
    this._trackedUpdate.addListener(listener);
  }

  removeListener(listener: TrackableListener) {
    this._trackedUpdate.removeListener(listener);
  }

  override _onUpdate(): void {
    const { platformFeature } = this;
    platformFeature._onUpdate();
    const { added, updated, removed } = platformFeature.getChanges();
    const { _trackedUpdate: trackedUpdate, _trackables: trackables, _trackIdToIndex: trackIdToIndex } = this;
    if (added?.length > 0) {
      for (let i = 0, n = added.length; i < n; i++) {
        const trackable = added[i];
        trackIdToIndex[trackable.id] = trackables.push(trackable) - 1;
      }
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Added, added);
    }
    if (updated?.length > 0) {
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Updated, updated);
    }
    if (removed?.length > 0) {
      for (let i = 0, n = removed.length; i < n; i++) {
        const trackable = removed[i];
        const trackId = trackable.id;
        trackables[trackIdToIndex[trackId]] = null;
        delete trackIdToIndex[trackId];
      }
      trackedUpdate.dispatch(XRTrackedUpdateFlag.Removed, removed);
    }
  }
}
