import { IXRRequestTracking, IXRTrackablePlatformFeature, IXRTracked } from "@galacean/engine-design";

export interface IWebXRTrackablePlatformFeature<T extends IXRTracked, K extends IXRRequestTracking<T>>
  extends IXRTrackablePlatformFeature<T, K> {
  /** @internal */
  _assembleOptions(options: XRSessionInit): Promise<void> | void;
}
