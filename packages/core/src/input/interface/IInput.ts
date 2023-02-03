export interface IInput {
  /**
   * If the input has focus.
   */
  get focus(): boolean;
  set focus(value: boolean);
  /**
   * Handler function updated every frame.
   */
  _update(): void;
  /**
   * Function called when the engine is destroyed.
   */
  _destroy(): void;
}
