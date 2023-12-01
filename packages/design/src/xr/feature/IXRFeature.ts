import { IXRFrame } from "../IXRFrame";
import { IXRSession } from "../IXRSession";
import { IXRFeatureConfig } from "./IXRFeatureConfig";
import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRFeature {
  /** @internal */
  _platformFeature: IXRPlatformFeature;
  /** Whether this feature enabled. */
  enabled: boolean;

  /**
   * Initialize the feature.
   */
  initialize(): Promise<void>;

  /**
   * Enable an instance of a feature.
   */
  onEnable(): void;

  /**
   * Disable an instance of a feature.
   */
  onDisable(): void;

  /**
   * Update an instance of a feature.
   */
  onUpdate(): void;

  /**
   * Destroy an instance of a feature.
   */
  onDestroy(): void;

  /**
   * Called when the session is initialized.
   */
  onSessionInit(): void;

  /**
   * Called when session starts.
   */
  onSessionStart(): void;

  /**
   * Called when the session is stopped.
   */
  onSessionStop(): void;

  /**
   * Called when the session is destroyed.
   */
  onSessionDestroy(): void;

  /**
   * Returns whether the feature is supported.
   */
  _isSupported(): Promise<void>;

  /**
   * Generate the config of the feature.
   */
  _generateConfig(): IXRFeatureConfig;
}
