import { Engine } from "../Engine";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { KeyCode } from "./keyboard/KeyCode";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  private _pointerManager: PointerManager;
  private _keyboardManager: KeyboardManager

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
   * Whether the button is being held down.
   * @param key 
   * @returns 
   */
  getKey(key: KeyCode | string): Boolean {
    if (typeof (key) === 'string') {
      key = KeyCode[key];
    }
    return !!this._keyboardManager._curKeyState[key];
  }

  /**
    * Whether the button is being held down.
    * @param key 
    * @returns 
    */
  getKeyDown(key: KeyCode | string): Boolean {
    if (typeof (key) === 'string') {
      key = KeyCode[key];
    }
    return this._keyboardManager._curFrameKeyDown[key] === this._keyboardManager._curFrameCount;

  }

  /**
   * Whether the button is being held down.
   * @param key 
   * @returns 
   */
  getKeyUp(key: KeyCode | string): Boolean {
    if (typeof (key) === 'string') {
      key = KeyCode[key];
    }
    return this._keyboardManager._curFrameKeyUp[key] === this._keyboardManager._curFrameCount;
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._keyboardManager = new KeyboardManager(engine);
    // @ts-ignore
    this._pointerManager = new PointerManager(engine, engine.canvas._webCanvas);
    window.addEventListener('blur', () => {
      const { _curKeyState } = this._keyboardManager;
      for (let i = _curKeyState.length - 1; i >= 0; i--) {
        _curKeyState[i] && (_curKeyState[i] = false);
      }
    });
  }

  /**
   * @internal
   */
  _update(): void {
    this._pointerManager._update();
    this._keyboardManager._update();
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._pointerManager._destroy();
    this._keyboardManager._destroy();
  }
}
