import { PointerEventData, Signal } from "@galacean/engine";
import { UIInteractive } from "../interactive/UIInteractive";

export class Button extends UIInteractive {
  /** Signal emitted when the button is clicked */
  readonly onClick = new Signal<[PointerEventData]>();

  /**
   * Add a listening function for click.
   * @deprecated Use `onClick.on(listener, context)` instead.
   * @param listener - The listening function
   */
  addClicked(listener: (event: PointerEventData) => void): void {
    this.onClick.on(listener);
  }

  /**
   * Remove a listening function of click.
   * @deprecated Use `onClick.off(listener, context)` instead.
   * @param listener - The listening function
   */
  removeClicked(listener: (event: PointerEventData) => void): void {
    this.onClick.off(listener);
  }

  override onPointerClick(event: PointerEventData): void {
    if (!this._getGlobalInteractive()) return;
    this.onClick.invoke(event);
  }

  override onDestroy(): void {
    super.onDestroy();
    this.onClick.removeAll();
  }
}
