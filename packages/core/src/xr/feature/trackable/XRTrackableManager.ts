import { IXRFeatureDescriptor, IXRRequestTracking, IXRTracked } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "./XRTrackablePlatformFeature";
import { XRFeatureManager } from "../XRFeatureManager";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { XRTrackedUpdateFlag } from "../../input/XRTrackedUpdateFlag";

/**
 * The base class of XR trackable manager.
 */
export abstract class XRTrackableManager<
  TDescriptor extends IXRFeatureDescriptor,
  TXRTracked extends IXRTracked,
  TTrackablePlatformFeature extends XRTrackablePlatformFeature<TXRTracked, IXRRequestTracking<TXRTracked>>
> extends XRFeatureManager<TDescriptor, TTrackablePlatformFeature> {
  private _trackedUpdateFlag: UpdateFlagManager = new UpdateFlagManager();

  /**
   * Return the tracked objects.
   */
  get trackedObjects(): readonly TXRTracked[] {
    return this._platformFeature.trackedObjects;
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

  override onUpdate(): void {
    const { _platformFeature: platformFeature, _trackedUpdateFlag: trackedUpdateFlag } = this;
    platformFeature._onUpdate();
    const { added, updated, removed } = platformFeature.getChanges();
    added.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Added, added);
    updated.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Updated, updated);
    removed.length > 0 && trackedUpdateFlag.dispatch(XRTrackedUpdateFlag.Removed, removed);
  }
}
