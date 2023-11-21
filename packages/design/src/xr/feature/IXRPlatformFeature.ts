import { IXRFeatureConfig } from "./IXRFeatureConfig";

/**
 * The base interface of the platform feature.
 * Responsible for the implementation of specific features of different XR backends.
 */
export interface IXRPlatformFeature {
  /**
   * Returns whether the feature is supported.
   * @param descriptor - The descriptor of the feature
   */
  isSupported(descriptor: IXRFeatureConfig): Promise<void>;
}
