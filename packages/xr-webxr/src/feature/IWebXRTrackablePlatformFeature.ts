import { IXRTrackablePlatformFeature } from "@galacean/engine-design";

export interface IWebXRTrackablePlatformFeature extends IXRTrackablePlatformFeature {
  /** @internal */
  _assembleOptions(options: XRSessionInit): Promise<void> | void;
}
