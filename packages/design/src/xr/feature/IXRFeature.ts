import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRFeature {
  /** @internal */
  _platformFeature: IXRPlatformFeature;
  /** Whether this feature enabled. */
  enabled: boolean;

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
  _onSessionExit(): void;
}
