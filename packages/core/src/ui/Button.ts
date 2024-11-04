import { PointerEventData } from "../input";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { UIInteractive } from "./interactive/UIInteractive";

export class Button extends UIInteractive {
  private _listeners: SafeLoopArray<IUIListener> = new SafeLoopArray<IUIListener>();

  /**
   * Add a listening function for click.
   * @param listener - The listening function
   */
  addClicked(listener: (event: PointerEventData) => void): void {
    this._listeners.push({ fn: listener });
  }

  /**
   * Remove a listening function of click.
   * @param listener - The listening function
   */
  removeClicked(listener: (event: PointerEventData) => void): void {
    this._listeners.findAndRemove((value) => (value.fn === listener ? (value.destroyed = true) : false));
  }

  override onPointerClick(event: PointerEventData): void {
    const listeners = this._listeners.getLoopArray();
    for (let i = 0, n = listeners.length; i < n; i++) {
      const listener = listeners[i];
      !listener.destroyed && listener.fn(event);
    }
  }

  override onDestroy(): void {
    super.onDestroy();
    this._listeners.findAndRemove((value) => (value.destroyed = true));
  }
}

export interface IUIListener {
  fn: (event: PointerEventData) => void;
  destroyed?: boolean;
}
