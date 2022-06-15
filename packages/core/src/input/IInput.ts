export interface IInput {
  /**
   * Handler function updated every frame.
   */
  _update(frameCount?: number): void;
  /**
   * Function called when the input changes from disabled to enabled state.
   */
  _enable(): void;
  /**
   * Function called when the input changes from enabled to disabled state.
   */
  _disable(): void;
  /**
   * Function called when the engine is destroyed.
   */
  _destroy(): void;
  /**
   * Function called when focus is lost.
   */
  _onBlur(): void;
}
