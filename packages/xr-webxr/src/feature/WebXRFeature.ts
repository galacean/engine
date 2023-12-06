import { IXRPlatformFeature } from "@galacean/engine-design";

export interface IWebXRFeature extends IXRPlatformFeature {
  /** @internal */
  _makeUpOptions(options: XRSessionInit): Promise<void> | void;
}
