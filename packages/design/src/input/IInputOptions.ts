/**
 * Options for the input.
 */
export interface IInputOptions {
  /**
   * The target element of the pointer event, defaults is the current canvas.
   * @remarks
   * @remarks: When setting the pointer target you need to specify:
   *  - Do not set window as target because window cannot listen to pointer leave event.
   *  - On mobile, pointer move may trigger the default slide event, thereby removing the point from the screen, so in most cases you need to set HtmlElement.style.touchAction = "none".
   */
  pointerTarget?: Exclude<EventTarget, Window & typeof globalThis>;

  /**
   * The target element of the keyboard event, defaults is the window.
   * @remarks
   * If the type of listening target is `HtmlElement`, you need to set tabIndex to make the element focus.
   */
  keyboardTarget?: EventTarget;

  /** The target element of the wheel event, defaults is the current canvas. */
  wheelTarget?: EventTarget;
}
