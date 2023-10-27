export interface IXRLifecycle {
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
  _onFrameUpdate(): void;

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
  _onDestroy(): void;
}
