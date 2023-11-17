import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

/**
 * The base interface of the platform feature.
 * Responsible for the implementation of specific features of different XR backends.
 */
export interface IXRFeature {
  /**
   * Returns whether the feature is supported.
   * @param descriptor - The descriptor of the feature
   */
  isSupported(descriptor: IXRFeatureDescriptor): Promise<void>;
}
