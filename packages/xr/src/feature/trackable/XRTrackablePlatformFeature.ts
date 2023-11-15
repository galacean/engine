import { XRPlatformFeature } from "@galacean/engine";
import { IXRRequestTracking, IXRTracked } from "@galacean/engine-design";

/**
 * The base class of XR trackable platform feature.
 */
export abstract class XRTrackablePlatformFeature<
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>
> extends XRPlatformFeature {
  private static _trackId: number = 0;

  protected _requestTrackings: TXRRequestTracking[] = [];
  protected _trackedObjects: TXRTracked[] = [];
  protected _added: TXRTracked[] = [];
  protected _updated: TXRTracked[] = [];
  protected _removed: TXRTracked[] = [];

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

  addRequestTracking(): void {}

  removeRequestTracking(): void {}

  removeAllRequestTrackings(): void {}

  /**
   * Returns the changes tracked in this frame.
   * @returns The changes of tracked objects
   */
  getChanges(): { readonly added: TXRTracked[]; readonly updated: TXRTracked[]; readonly removed: TXRTracked[] } {
    return { added: this._added, updated: this._updated, removed: this._removed };
  }

  override _onSessionStop(): void {
    this._added.length = this._updated.length = this._removed.length = 0;
  }

  override _onSessionDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  override _onDestroy(): void {
    // prettier-ignore
    this._requestTrackings.length = this._trackedObjects.length = this._added.length = this._updated.length = this._removed.length = 0;
  }

  protected _generateUUID(): number {
    return XRTrackablePlatformFeature._trackId++;
  }
}
