import { Engine } from "../Engine";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  /** Input is enabled by default. */
  private _enabled: boolean = true;
  private _pointerManager: PointerManager;

  /**
   * Pointer List.
   */
  get pointers(): Readonly<Pointer[]> {
    return this._pointerManager ? this._pointerManager._pointers : null;
  }

  /**
   *  Whether to handle multi-pointer.
   */
  get multiPointerEnabled(): boolean {
    return this._pointerManager ? this._pointerManager._multiPointerEnabled : false;
  }

  set multiPointerEnabled(enabled: boolean) {
    this._pointerManager && (this._pointerManager._multiPointerEnabled = enabled);
  }

  /**
   * Whether to disable input.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (canvas instanceof HTMLCanvasElement) {
      this.enabled = true;
      this._pointerManager = new PointerManager(engine, canvas);
    } else {
      this.enabled = false;
    }
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._enabled) {
      this._pointerManager._update();
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._pointerManager?._destroy();
  }
}
