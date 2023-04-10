import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { IInput } from "../interface/IInput";

/**
 * Wheel Manager.
 * @internal
 */
export class WheelManager implements IInput {
  /** @internal */
  _delta: Vector3 = new Vector3();

  private _nativeEvents: WheelEvent[] = [];
  private _canvas: HTMLCanvasElement;
  private _hadListener: boolean;

  /**
   * Create a KeyboardManager.
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const htmlCanvas = engine._canvas._webCanvas;
    this._onWheelEvent = this._onWheelEvent.bind(this);
    htmlCanvas.addEventListener("wheel", this._onWheelEvent);
    this._canvas = htmlCanvas;
    this._hadListener = true;
  }

  /**
   * @internal
   */
  _update(): void {
    const { _delta: delta } = this;
    delta.set(0, 0, 0);
    const { _nativeEvents: nativeEvents } = this;
    if (nativeEvents.length > 0) {
      for (let i = nativeEvents.length - 1; i >= 0; i--) {
        const evt = nativeEvents[i];
        delta.x += evt.deltaX;
        delta.y += evt.deltaY;
        delta.z += evt.deltaZ;
      }
      nativeEvents.length = 0;
    }
  }

  /**
   * @internal
   */
  _onFocus(): void {
    if (!this._hadListener) {
      this._canvas.addEventListener("wheel", this._onWheelEvent);
      this._hadListener = true;
    }
  }

  /**
   * @internal
   */
  _onBlur(): void {
    if (this._hadListener) {
      this._canvas.removeEventListener("wheel", this._onWheelEvent);
      this._nativeEvents.length = 0;
      this._delta.set(0, 0, 0);
      this._hadListener = false;
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._hadListener) {
      this._canvas.removeEventListener("wheel", this._onWheelEvent);
      this._hadListener = false;
    }
    this._nativeEvents = null;
  }

  private _onWheelEvent(evt: WheelEvent): void {
    evt.cancelable && evt.preventDefault();
    this._nativeEvents.push(evt);
  }
}
