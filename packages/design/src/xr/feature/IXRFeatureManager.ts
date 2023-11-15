import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRFeatureManager {
  descriptor: IXRFeatureDescriptor;
  enabled: boolean;

  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void>;
  initialize(): Promise<void>;

  /**
   * Enable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onEnable(): void;

  /**
   * Disable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDisable(): void;

  /**
   * Update an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onUpdate(): void;

  /**
   * Destroy an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDestroy(): void;

  /**
   * @internal
   */
  onSessionInit(): void;

  /**
   * @internal
   */
  onSessionStart(): void;

  /**
   * @internal
   */
  onSessionStop(): void;

  /**
   * @internal
   */
  onSessionDestroy(): void;
}
