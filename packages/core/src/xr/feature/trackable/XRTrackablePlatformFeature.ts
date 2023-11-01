import { IXRTrackable } from "@galacean/engine-design";
import { XRPlatformFeature } from "../XRPlatformFeature";

export abstract class XRTrackablePlatformFeature<T extends IXRTrackable> extends XRPlatformFeature {
  private static _trackId: number = 0;

  generateUUID(): number {
    return XRTrackablePlatformFeature._trackId++;
  }

  getChanges(): { readonly added: T[]; readonly updated: T[]; readonly removed: T[] } {
    return { added: [], updated: [], removed: [] };
  }
}
