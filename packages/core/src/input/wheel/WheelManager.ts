import { Vector3 } from "@oasis-engine/math";
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
  private _focus: boolean = true;
  private _hadListener: boolean = false;

  /**
   * If the input has focus.
   */
  get focus(): boolean {
    return this._focus;
  }

  set focus(value: boolean) {
    if (this._focus !== value) {
      this._focus = value;
      value ? this._addListener() : this._removeListener();
    }
  }

  /**
   * Create a KeyboardManager.
   */
  constructor(engine: Engine) {
    // @ts-ignore
    this._canvas = engine.canvas._webCanvas;
    this._onWheelEvent = this._onWheelEvent.bind(this);
    this._addListener();
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
  _destroy(): void {
    this._removeListener();
    this._delta = null;
    this._nativeEvents = null;
  }

  private _addListener(): void {
    if (!this._hadListener) {
      this._canvas.addEventListener("wheel", this._onWheelEvent);
      this._hadListener = true;
    }
  }

  private _removeListener(): void {
    if (this._hadListener) {
      this._canvas.removeEventListener("wheel", this._onWheelEvent);
      this._nativeEvents.length = 0;
      this._delta.set(0, 0, 0);
      this._hadListener = false;
    }
  }

  private _onWheelEvent(evt: WheelEvent): void {
    evt.cancelable && evt.preventDefault();
    this._nativeEvents.push(evt);
  }
}
