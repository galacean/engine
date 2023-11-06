import { IXRFeatureDescriptor, IXRTrackable } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "./XRTrackablePlatformFeature";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "./XRTrackedUpdateFlag";
import { XRFeatureManager } from "../XRFeatureManager";

export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TTrackablePlatformFeature extends XRTrackablePlatformFeature<TXRTrackable>,
  TXRTrackable extends IXRTrackable
> extends XRFeatureManager<TDescriptor, TTrackablePlatformFeature> {
  private _trackedUpdate: UpdateFlagManager = new UpdateFlagManager();

  get trackedObjects(): readonly TXRTrackable[] {
    return this._platformFeature.trackedObjects;
  }

  addListener(listener: (type: XRTrackedUpdateFlag, param: readonly IXRTrackable[]) => any) {
    this._trackedUpdate.addListener(listener);
  }

  removeListener(listener: (type: XRTrackedUpdateFlag, param: readonly IXRTrackable[]) => any) {
    this._trackedUpdate.removeListener(listener);
  }

  override _onUpdate(): void {
    const { _platformFeature: platformFeature } = this;
    platformFeature._onUpdate();
    const { added, updated, removed } = platformFeature.getChanges();
    const { _trackedUpdate: trackedUpdate } = this;
    added.length > 0 && trackedUpdate.dispatch(XRTrackedUpdateFlag.Added, added);
    updated.length > 0 && trackedUpdate.dispatch(XRTrackedUpdateFlag.Updated, updated);
    removed.length > 0 && trackedUpdate.dispatch(XRTrackedUpdateFlag.Removed, removed);
  }
}
