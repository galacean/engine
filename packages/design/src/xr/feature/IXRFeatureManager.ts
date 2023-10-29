import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRFeatureManager {
  descriptor: IXRFeatureDescriptor;
  platformFeature: IXRPlatformFeature;
  enabled: boolean;

  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void>;
  initialize(): Promise<void>;

  /**
   * Enable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onEnable(): void;

  /**
   * Disable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onDisable(): void;

  /**
   * Update an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onUpdate(): void;

  /**
   * Destroy an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onDestroy(): void;

  /**
   * @internal
   */
  _onSessionInit(): void;

  /**
   * @internal
   */
  _onSessionStart(): void;

  /**
   * @internal
   */
  _onSessionStop(): void;

  /**
   * @internal
   */
  _onSessionDestroy(): void;
}
