import { Engine } from "../Engine";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  private _pointerManager: PointerManager;

  /**
   * Pointer List.
   */
  get pointers(): Readonly<Pointer[]> {
    return this._pointerManager._pointers;
  }

  /**
   *  Whether to handle multi-pointer.
   */
  get multiPointerEnabled(): boolean {
    return this._pointerManager._multiPointerEnabled;
  }

  set multiPointerEnabled(enabled: boolean) {
    this._pointerManager._multiPointerEnabled = enabled;
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    // @ts-ignore
    this._pointerManager = new PointerManager(engine, engine.canvas._webCanvas);
  }

  /**
   * @internal
   */
  _update(): void {
    this._pointerManager._update();
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._pointerManager._destroy();
  }
}
