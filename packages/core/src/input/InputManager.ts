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
   * Whether the key is being held down, if there is no parameter, return whether any key is being held down.
   * @param key KeyCode of key
   * @returns 
   */
  isKeyHeldDown(key?: KeyCode): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameHeldDownList.length > 0;
    } else {
      return !!this._keyboardManager._curHeldDownKey2IndexMap[key];
    }
  }

  /**
    * Whether the current frame key has been pressed, if there is no parameter, return whether any key has been pressed.
    * @param key KeyCode of key
    * @returns 
    */
  isKeyDown(key?: KeyCode): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameDownList.length > 0;
    } else {
      return this._keyboardManager._curFrameDownKey2FrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * Whether the current frame key has been lifted, if there is no parameter, return whether any key has been lifted.
   * @param key KeyCode of key
   * @returns 
   */
  isKeyUp(key?: KeyCode): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameUpList.length > 0;
    } else {
      return this._keyboardManager._curFrameUpKey2FrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._keyboardManager = new KeyboardManager();
    // @ts-ignore
    this._pointerManager = new PointerManager(engine, engine.canvas._webCanvas);
    window.addEventListener('blur', () => {
      this._keyboardManager._onBlur();
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
