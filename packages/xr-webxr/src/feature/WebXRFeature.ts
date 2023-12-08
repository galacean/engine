import { IXRPlatformFeature } from "@galacean/engine-design";

/**
 * @internal
 */
export abstract class WebXRFeature implements IXRPlatformFeature {
  /** @internal */
  abstract _assembleOptions(options: XRSessionInit): Promise<void> | void;
}
