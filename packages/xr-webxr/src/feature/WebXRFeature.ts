import { IXRPlatformFeature } from "@galacean/engine-design";

export abstract class WebXRFeature implements IXRPlatformFeature {
  /** @internal */
  abstract _assembleOptions(options: XRSessionInit): Promise<void> | void;
}
