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
   * @internal
   */
  _onEnable(): void;

  /**
   * @internal
   */
  _onDisable(): void;

  /**
   * @internal
   */
  _onUpdate(): void;

  /**
   * @internal
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

  /**
   * @internal
   */
  _generateConfig(): IXRFeatureConfig;
}
