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
  private _keyboardManager: KeyboardManager;

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
   * @param key - The keys of the keyboard
   * @returns Whether the key is being held down.
   */
  isKeyHeldDown(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameHeldDownList.length > 0;
    } else {
      return this._keyboardManager._curHeldDownKeyToIndexMap[key] != null;
    }
  }

  /**
   * Whether the key starts to be pressed down during the current frame, if there is no parameter, return whether any key starts to be pressed down during the current frame.
   * @param key - The keys of the keyboard
   * @returns Whether the key starts to be pressed down during the current frame.
   */
  isKeyDown(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameDownList.length > 0;
    } else {
      return this._keyboardManager._downKeyToFrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * Whether the key is released during the current frame, if there is no parameter, return whether any key released during the current frame.
   * @param key - The keys of the keyboard
   * @returns Whether the key is released during the current frame.
   */
  isKeyUp(key?: Keys): boolean {
    if (key === undefined) {
      return this._keyboardManager._curFrameUpList.length > 0;
    } else {
      return this._keyboardManager._upKeyToFrameCountMap[key] === this._keyboardManager._curFrameCount;
    }
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (canvas instanceof HTMLCanvasElement) {
      this._enabled = true;
      this._pointerManager = new PointerManager(engine, canvas);
      this._keyboardManager = new KeyboardManager();
      this._onBlur = this._onBlur.bind(this);
      window.addEventListener("blur", this._onBlur);
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
      window.removeEventListener("blur", this._onBlur);
      this._pointerManager._destroy();
      this._keyboardManager._destroy();
    }
  }

  private _onBlur(): void {
    if (this._enabled) {
      this._keyboardManager._onBlur();
    }
  }
}
