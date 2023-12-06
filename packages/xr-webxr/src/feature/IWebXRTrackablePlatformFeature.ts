import { IXRTrackablePlatformFeature } from "@galacean/engine-design";

export interface IWebXRTrackablePlatformFeature extends IXRTrackablePlatformFeature {
  /** @internal */
  _makeUpOptions(options: XRSessionInit): Promise<void> | void;
}
