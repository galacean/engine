export interface IXRFeatureManager {
  enabled: boolean;
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

  _onSessionStart(): void;

  _onSessionStop(): void;

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
}
