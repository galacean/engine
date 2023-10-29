import { IXRTrackable } from "@galacean/engine-design";

export class XRTrackableFeature<T extends IXRTrackable> {
  getChanges(): { readonly added: T[]; readonly updated: T[]; readonly removed: T[] } {
    return { added: [], updated: [], removed: [] };
  }
}
