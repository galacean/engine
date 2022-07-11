import { Engine } from "../Engine";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { Keys } from "./enums/Keys";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";
import { PointerButton } from "./enums/PointerButton";
import { WheelManager } from "./wheel/WheelManager";
import { Vector2, Vector3 } from "@oasis-engine/math";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  /** Sometimes the input module will not be initialized, such as off-screen rendering. */
  private _initialized: boolean = false;
  private _curFrameCount: number = 0;
  private _wheelManager: WheelManager;
  private _pointerManager: PointerManager;
  private _keyboardManager: KeyboardManager;

  /**
   * Pointer List.
   */
  get pointers(): Readonly<Pointer[] | null> {
    return this._initialized ? this._pointerManager._pointers : null;
  }

  /**
   *  Whether to handle multi-pointer.
   */
  get multiPointerEnabled(): boolean {
    return this._initialized ? this._pointerManager._multiPointerEnabled : false;
  }

  set multiPointerEnabled(enabled: boolean) {
    this._initialized && (this._pointerManager._multiPointerEnabled = enabled);
  }

  /**
   * Get the change of the scroll wheel on the x-axis.
   * @returns Change value
   */
  get wheelDelta(): Readonly<Vector3 | null> {
    return this._initialized ? this._wheelManager._delta : null;
  }

  /**
   * Get the change of the pointer.
   * @returns Change value
   */
  get pointerMovingDelta(): Readonly<Vector2 | null> {
    return this._initialized ? this._pointerManager._movingDelta : null;
  }

  /**
   * Get the position of the pointer.
   * @returns The position of the pointer
   */
  get pointerPosition(): Readonly<Vector2> {
    return this._initialized && this._pointerManager._pointers.length > 0
      ? this._pointerManager._currentPosition
      : null;
  }

  /**
   * Whether the key is being held down, if there is no parameter, return whether any key is being held down.
   * @param key - The keys of the keyboard
   * @returns Whether the key is being held down
   */
  isKeyHeldDown(key?: Keys): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameHeldDownList.length > 0;
      } else {
        return this._keyboardManager._curHeldDownKeyToIndexMap[key] != null;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the key starts to be pressed down during the current frame, if there is no parameter, return whether any key starts to be pressed down during the current frame.
   * @param key - The keys of the keyboard
   * @returns Whether the key starts to be pressed down during the current frame
   */
  isKeyDown(key?: Keys): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameDownList.length > 0;
      } else {
        return this._keyboardManager._downKeyToFrameCountMap[key] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the key is released during the current frame, if there is no parameter, return whether any key released during the current frame.
   * @param key - The keys of the keyboard
   * @returns Whether the key is released during the current frame
   */
  isKeyUp(key?: Keys): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameUpList.length > 0;
      } else {
        return this._keyboardManager._upKeyToFrameCountMap[key] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the pointer is being held down, if there is no parameter, return whether any pointer is being held down.
   * @param pointerButton - The pointerButton on a pointer device
   * @returns Whether the pointer is being held down
   */
  isPointerHeldDown(pointerButton?: PointerButton): boolean {
    if (this._initialized) {
      if (pointerButton === undefined) {
        return this._pointerManager._buttons !== 0;
      } else {
        return (this._pointerManager._buttons & PointerManager.Buttons[pointerButton]) !== 0;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the pointer starts to be pressed down during the current frame, if there is no parameter, return whether any pointer starts to be pressed down during the current frame.
   * @param pointerButton - The pointerButton on a pointer device
   * @returns Whether the pointer starts to be pressed down during the current frame
   */
  isPointerDown(pointerButton: PointerButton): boolean {
    if (this._initialized) {
      if (pointerButton === undefined) {
        return this._pointerManager._downList.length > 0;
      } else {
        return this._pointerManager._downMap[pointerButton] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the pointer is released during the current frame, if there is no parameter, return whether any pointer released during the current frame.
   * @param pointerButton - The pointerButtons on a mouse device
   * @returns Whether the pointer is released during the current frame
   */
  isPointerUp(pointerButton: PointerButton): boolean {
    if (this._initialized) {
      if (pointerButton === undefined) {
        return this._pointerManager._upList.length > 0;
      } else {
        return this._pointerManager._upMap[pointerButton] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (canvas instanceof HTMLCanvasElement) {
      this._wheelManager = new WheelManager(canvas);
      this._pointerManager = new PointerManager(engine, canvas);
      this._keyboardManager = new KeyboardManager();
      this._onBlur = this._onBlur.bind(this);
      window.addEventListener("blur", this._onBlur);
      this._onFocus = this._onFocus.bind(this);
      window.addEventListener("focus", this._onFocus);
      this._initialized = true;
    }
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._initialized) {
      ++this._curFrameCount;
      this._wheelManager._update();
      this._pointerManager._update(this._curFrameCount);
      this._keyboardManager._update(this._curFrameCount);
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._initialized) {
      window.removeEventListener("blur", this._onBlur);
      window.removeEventListener("focus", this._onFocus);
      this._wheelManager._destroy();
      this._pointerManager._destroy();
      this._keyboardManager._destroy();
    }
  }

  private _onBlur(): void {
    this._wheelManager._onBlur();
    this._pointerManager._onBlur();
    this._keyboardManager._onBlur();
  }

  private _onFocus(): void {
    this._wheelManager._onFocus();
    this._pointerManager._onFocus();
    this._keyboardManager._onFocus();
  }
}
