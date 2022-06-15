import { Engine } from "../Engine";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { Keys } from "./enums/Keys";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";
import { PointerButton } from "./enums/PointerType";
import { WheelManager } from "./wheel/WheelManager";
import { InputType } from "./enums/InputType";
import { Vector2 } from "@oasis-engine/math";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  /** Sometimes the input module will not be initialized, such as off-screen rendering. */
  /** @internal */
  _initialized: boolean = false;

  private _enabledTypes: number = InputType.None;
  private _curFrameCount: number;

  private _wheelManager: WheelManager;
  private _pointerManager: PointerManager;
  private _keyboardManager: KeyboardManager;

  /**
   * Set of received input types.
   */
  get enabledTypes(): number {
    return this._enabledTypes;
  }

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
  get wheelDeltaX(): number {
    return this._initialized ? this._wheelManager._deltaX : 0;
  }

  /**
   * Get the change of the scroll wheel on the y-axis.
   * @returns Change value
   */
  get wheelDeltaY(): number {
    return this._initialized ? this._wheelManager._deltaY : 0;
  }

  /**
   * Get the change of the scroll wheel on the z-axis.
   * @returns Change value
   */
  get wheelDeltaZ(): number {
    return this._initialized ? this._wheelManager._deltaY : 0;
  }

  /**
   * Get the change of the pointer.
   * @returns Change value
   */
  get pointerMovingDelta(): Readonly<Vector2 | null> {
    return this._initialized ? this._pointerManager._movingDelta : null;
  }

  /**
   * Handle this type of input.
   * @param type - The type of the input
   */
  enableInput(type: InputType): void {
    if (this._initialized) {
      const diff = this._enabledTypes ^ type;
      if (diff) {
        this._enabledTypes |= type;
        diff & InputType.Wheel && this._wheelManager._enable();
        diff & InputType.Pointer && this._pointerManager._enable();
        diff & InputType.Keyboard && this._keyboardManager._enable();
      }
    }
  }

  /**
   * Does not handle this type of input.
   * @param type - The type of the input
   */
  disableInput(type: InputType): void {
    if (this._initialized) {
      const same = this._enabledTypes & type;
      if (same) {
        this._enabledTypes &= ~type;
        same & InputType.Wheel && this._wheelManager._disable();
        same & InputType.Pointer && this._pointerManager._disable();
        same & InputType.Keyboard && this._keyboardManager._disable();
      }
    }
  }

  /**
   * Whether the key is being held down, if there is no parameter, return whether any key is being held down.
   * @param key - The keys of the keyboard
   * @returns Whether the key is being held down
   */
  isKeyHeldDown(key?: Keys | string | number): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameDownList.length > 0;
      } else if (typeof key === "string") {
        return !!this._keyboardManager._curHeldDownKeyToIndexMap[Keys[key]];
      } else {
        return !!this._keyboardManager._curHeldDownKeyToIndexMap[key];
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
  isKeyDown(key?: Keys | string | number): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameDownList.length > 0;
      } else if (typeof key === "string") {
        return this._keyboardManager._downKeyToFrameCountMap[Keys[key]] === this._curFrameCount;
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
  isKeyUp(key?: Keys | string | number): boolean {
    if (this._initialized) {
      if (key === undefined) {
        return this._keyboardManager._curFrameUpList.length > 0;
      } else if (typeof key === "string") {
        return this._keyboardManager._upKeyToFrameCountMap[Keys[key]] === this._curFrameCount;
      } else {
        return this._keyboardManager._upKeyToFrameCountMap[key] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the button is being held down, if there is no parameter, return whether any button is being held down.
   * @param button - The buttons on a mouse device
   * @returns Whether the button is being held down
   */
  isButtonHeldDown(button?: PointerButton): boolean {
    if (this._initialized) {
      if (button === undefined) {
        return this._pointerManager._heldDownList.length > 0;
      } else {
        return !!this._pointerManager._heldDownMap[button];
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the button starts to be pressed down during the current frame, if there is no parameter, return whether any button starts to be pressed down during the current frame.
   * @param button - The buttons on a mouse device
   * @returns Whether the button starts to be pressed down during the current frame
   */
  isButtonDown(button: PointerButton): boolean {
    if (this._initialized) {
      if (button === undefined) {
        return this._pointerManager._downList.length > 0;
      } else {
        return this._pointerManager._downMap[button] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Whether the button is released during the current frame, if there is no parameter, return whether any button released during the current frame.
   * @param button - The buttons on a mouse device
   * @returns Whether the button is released during the current frame
   */
  isButtonUp(button: PointerButton): boolean {
    if (this._initialized) {
      if (button === undefined) {
        return this._pointerManager._upList.length > 0;
      } else {
        return this._pointerManager._upMap[button] === this._curFrameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * Set hotkey.
   * @param key - The name of hotkey
   * @param value - The value of hotkey
   */
  registerHotKey(key: string, value: number): void {
    Keys[key] = value;
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (canvas instanceof HTMLCanvasElement) {
      this._enabledTypes = InputType.All;
      this._wheelManager = new WheelManager(canvas);
      this._pointerManager = new PointerManager(engine, canvas);
      this._keyboardManager = new KeyboardManager();
      this._onBlur = this._onBlur.bind(this);
      window.addEventListener("blur", this._onBlur);
      this._initialized = true;
    }
  }

  /**
   * @internal
   */
  _update(): void {
    ++this._curFrameCount;
    const { _enabledTypes: enabledTypes } = this;
    enabledTypes & InputType.Wheel && this._wheelManager._update();
    enabledTypes & InputType.Pointer && this._pointerManager._update(this._curFrameCount);
    enabledTypes & InputType.Keyboard && this._keyboardManager._update(this._curFrameCount);
  }

  /**
   * @internal
   */
  _destroy(): void {
    window.removeEventListener("blur", this._onBlur);
    this._wheelManager._destroy();
    this._pointerManager._destroy();
    this._keyboardManager._destroy();
  }

  private _onBlur(): void {
    const { _enabledTypes: enabledTypes } = this;
    enabledTypes & InputType.Wheel && this._wheelManager._onBlur();
    enabledTypes & InputType.Pointer && this._pointerManager._onBlur();
    enabledTypes & InputType.Keyboard && this._keyboardManager._onBlur();
  }
}
