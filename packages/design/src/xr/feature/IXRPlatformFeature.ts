import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

/**
 * The base interface of the platform feature.
 * Responsible for the implementation of specific features of different XR backends.
 */
export interface IXRPlatformFeature {
  /**
   * Returns whether the feature is supported.
   * @param descriptor - The descriptor of the feature
   */
  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void>;

  /**
   * Initialize the feature.
   * @param descriptor - The descriptor of the feature
   */
  _initialize(descriptor: IXRFeatureDescriptor): Promise<void>;

  /**
   * Called when the XR frame is updated.
   */
  _onUpdate(): void;

  /**
   * Called when the XR module is destroyed.
   */
  _onDestroy(): void;

  /**
   * Called when the session is initialized.
   */
  _onSessionInit(): void;

  /**
   * Called when session starts.
   */
  _onSessionStart(): void;

  /**
   * Called when the session is stopped.
   */
  _onSessionStop(): void;

  /**
   * Called when the session is destroyed.
   */
  _onSessionDestroy(): void;
}
