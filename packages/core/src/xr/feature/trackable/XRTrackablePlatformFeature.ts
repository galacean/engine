import { IXRTrackable } from "@galacean/engine-design";
import { XRPlatformFeature } from "../XRPlatformFeature";

export abstract class XRTrackablePlatformFeature<T extends IXRTrackable> extends XRPlatformFeature {
  private static _trackId: number = 0;

  protected _trackedObjects: T[] = [];
  protected _added: T[] = [];
  protected _updated: T[] = [];
  protected _removed: T[] = [];

  get trackedObjects(): readonly T[] {
    return this._trackedObjects;
  }

  getChanges(): { readonly added: T[]; readonly updated: T[]; readonly removed: T[] } {
    return { added: this._added, updated: this._updated, removed: this._removed };
  }

  protected _generateUUID(): number {
    return XRTrackablePlatformFeature._trackId++;
  }
}
