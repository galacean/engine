import { Engine } from "../Engine";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { Keys } from "./enums/Keys";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  /** Disable input for offscreen rendering. */
  private _enabled: boolean = true;
  private _pointerManager: PointerManager;
  private _keyboardManager: KeyboardManager

  /**
   * Pointer List.
   */
  get pointers(): Readonly<Pointer[]> {
    return this._enabled ? this._pointerManager._pointers : null;
  }

  /**
   *  Whether to handle multi-pointer.
   */
  get multiPointerEnabled(): boolean {
    return this._enabled ? this._pointerManager._multiPointerEnabled : false;
  }

  set multiPointerEnabled(enabled: boolean) {
    this._enabled && (this._pointerManager._multiPointerEnabled = enabled);
  }

  /**
   * Whether the key is being held down, if there is no parameter, return whether any key is being held down.
   * @param key - KeyCode of key
   * @returns Whether ths key is being held down.
   */
  isKeyHeldDown(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameHeldDownList.length > 0;
    } else {
      return !!this._keyboardManager._curHeldDownKeyToIndexMap[key];
    }
  }

  /**
    * Whether the current frame key has been pressed, if there is no parameter, return whether any key has been pressed.
    * @param key - KeyCode of key
    * @returns Whether ths key has been pressed.
    */
  isKeyDown(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameDownList.length > 0;
    } else {
      return this._keyboardManager._curFrameDownKeyToFrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * Whether the current frame key has been lifted, if there is no parameter, return whether any key has been lifted.
   * @param key - KeyCode of key
   * @returns Whether ths key has been lifted.
   */
  isKeyUp(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameUpList.length > 0;
    } else {
      return this._keyboardManager._curFrameUpKeyToFrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._keyboardManager = new KeyboardManager();
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (canvas instanceof HTMLCanvasElement) {
      this._enabled = true;
      this._pointerManager = new PointerManager(engine, canvas);
      this._keyboardManager = new KeyboardManager();
      window.addEventListener('blur', () => {
        this._keyboardManager._onBlur();
      });
    } else {
      this._enabled = false;
    }
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._enabled) {
      this._pointerManager._update();
      this._keyboardManager._update();
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._enabled) {
      this._pointerManager._destroy();
      this._keyboardManager._destroy();
    }
  }
}
