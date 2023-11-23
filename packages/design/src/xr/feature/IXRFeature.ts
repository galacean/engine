import { IXRFeatureConfig } from "./IXRFeatureConfig";
import { IXRPlatformFeature } from "./IXRPlatformFeature";
import { IXRSession } from "../IXRSession";
import { IXRFrame } from "../IXRFrame";

export interface IXRFeature {
  /** @internal */
  _platformFeature: IXRPlatformFeature;
  /** Whether this feature enabled. */
  enabled: boolean;

  /**
   * Returns whether the feature is supported.
   */
  isSupported(): Promise<void>;

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
  onUpdate(session: IXRSession, frame: IXRFrame): void;

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
   * Generate the config of the feature.
   */
  _generateConfig(): IXRFeatureConfig;
}
