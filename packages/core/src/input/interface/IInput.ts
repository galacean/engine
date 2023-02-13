export interface IInput {
  /**
   * Handler function updated every frame.
   */
  _update(): void;
  /**
   * Function called when the engine is destroyed.
   */
  _destroy(): void;
  /**
   * Function called when focused.
   */
  _onFocus(): void;
  /**
   * Function called when focus is lost.
   */
  _onBlur(): void;
}
