import { IInput } from "../IInput";

/**
 * Wheel Manager.
 * @internal
 */
export class WheelManager implements IInput {
  /** @internal */
  _deltaX: number = 0;
  /** @internal */
  _deltaY: number = 0;
  /** @internal */
  _deltaZ: number = 0;

  private _nativeEvents: WheelEvent[] = [];
  private _canvas: HTMLCanvasElement;

  /**
   * Create a KeyboardManager.
   */
  constructor(htmlCanvas: HTMLCanvasElement) {
    this._onWheelEvent = this._onWheelEvent.bind(this);
    htmlCanvas.addEventListener("wheel", this._onWheelEvent);
  }

  /**
   * @internal
   */
  _update(): void {
    this._deltaX = this._deltaY = this._deltaZ = 0;
    const { _nativeEvents: nativeEvents } = this;
    if (nativeEvents.length > 0) {
      for (let i = nativeEvents.length - 1; i >= 0; i--) {
        const evt = nativeEvents[i];
        this._deltaX += evt.deltaX;
        this._deltaY += evt.deltaY;
        this._deltaZ += evt.deltaZ;
      }
    }
  }

  /**
   * @internal
   */
  _enable(): void {
    this._canvas.addEventListener("wheel", this._onWheelEvent);
  }

  /**
   * @internal
   */
  _disable(): void {
    this._canvas.removeEventListener("wheel", this._onWheelEvent);
  }

  /**
   * @internal
   */
  _onBlur(): void {
    this._nativeEvents.length = 0;
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._canvas.removeEventListener("wheel", this._onWheelEvent);
    this._nativeEvents = null;
  }

  private _onWheelEvent(evt: WheelEvent): void {
    this._nativeEvents.push(evt);
  }
}
