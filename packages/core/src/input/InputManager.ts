import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Keys } from "./enums/Keys";
import { PointerButton, _pointerBin2DecMap } from "./enums/PointerButton";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";
import { WheelManager } from "./wheel/WheelManager";
import { Scene } from "../Scene";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  private _engine: Engine;
  /** Sometimes the input module will not be initialized, such as off-screen rendering. */
  private _initialized: boolean = false;
  private _wheelManager: WheelManager;
  private _pointerManager: PointerManager;
  private _keyboardManager: KeyboardManager;

  /**
   * Pointer list.
   */
  get pointers(): Readonly<Pointer[]> {
    return this._initialized ? this._pointerManager._pointers : [];
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
        return this._keyboardManager._downKeyToFrameCountMap[key] === this._engine.time.frameCount;
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
        return this._keyboardManager._upKeyToFrameCountMap[key] === this._engine.time.frameCount;
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
        return (this._pointerManager._buttons & pointerButton) !== 0;
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
  isPointerDown(pointerButton?: PointerButton): boolean {
    if (this._initialized) {
      if (pointerButton === undefined) {
        return this._pointerManager._downList.length > 0;
      } else {
        return this._pointerManager._downMap[_pointerBin2DecMap[pointerButton]] === this._engine.time.frameCount;
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
  isPointerUp(pointerButton?: PointerButton): boolean {
    if (this._initialized) {
      if (pointerButton === undefined) {
        return this._pointerManager._upList.length > 0;
      } else {
        return this._pointerManager._upMap[_pointerBin2DecMap[pointerButton]] === this._engine.time.frameCount;
      }
    } else {
      return false;
    }
  }

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._engine = engine;
    // @ts-ignore
    const canvas = engine._canvas._webCanvas;
    if (typeof OffscreenCanvas === "undefined" || !(canvas instanceof OffscreenCanvas)) {
      this._wheelManager = new WheelManager(engine);
      this._pointerManager = new PointerManager(engine);
      this._keyboardManager = new KeyboardManager(engine);
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
      this._wheelManager._update();
      this._pointerManager._update();
      this._keyboardManager._update();
    }
  }

  /**
   * @internal
   */
  _firePointerScript(scenes: readonly Scene[]): void {
    this._initialized && this._pointerManager._firePointerScript(scenes);
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._initialized) {
      window.removeEventListener("blur", this._onBlur);
      window.removeEventListener("focus", this._onFocus);
      this._wheelManager._destroy();
      this._wheelManager = null;
      this._pointerManager._destroy();
      this._pointerManager = null;
      this._keyboardManager._destroy();
      this._keyboardManager = null;
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
