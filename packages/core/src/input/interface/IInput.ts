export interface IInput {
  /**
   * Handler function updated every frame.
   */
  _update(): void;
  /**
   * Function called when the engine is destroyed.
   */
  _destroy(): void;
}
