import { Engine } from "../Engine";
import { KeyboardManager } from "./keyboard/KeyboardManager";
import { Keys } from "./enums/Keys";
import { Pointer } from "./pointer/Pointer";
import { PointerManager } from "./pointer/PointerManager";
import { PointerButton, _pointerBin2DecMap } from "./enums/PointerButton";
import { WheelManager } from "./wheel/WheelManager";
import { Vector3 } from "@oasis-engine/math";
import { IInput } from "./interface/IInput";
import { InputType } from "./enums/InputType";

/**
 * InputManager manages device input such as mouse, touch, keyboard, etc.
 */
export class InputManager {
  private _engine: Engine;
  /** Sometimes the input module will not be initialized, such as off-screen rendering. */
  private _initialized: boolean = false;
  private _inputInstances: IInput[] = new Array(InputType.length);

  /**
   * Pointer list.
   */
  get pointers(): Readonly<Pointer[]> {
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    return pointerManager ? pointerManager._pointers : [];
  }

  /**
   *  Whether to handle multi-pointer.
   */
  get multiPointerEnabled(): boolean {
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    return pointerManager ? pointerManager._multiPointerEnabled : false;
  }

  set multiPointerEnabled(enabled: boolean) {
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    pointerManager && (pointerManager._multiPointerEnabled = enabled);
  }

  /**
   * Get the change of the scroll wheel on the x-axis.
   * @returns Change value
   */
  get wheelDelta(): Readonly<Vector3 | null> {
    const wheelManager = this.getInput<WheelManager>(InputType.Wheel);
    return wheelManager ? wheelManager._delta : null;
  }

  /**
   * Get an instance of this input type.
   * @param inputType - The type of this input
   * @returns Instance of this input
   */
  getInput<T>(inputType: InputType): T {
    return this._inputInstances[inputType] as T;
  }

  /**
   * Add an instance of an input type
   * @param inputType - The type of this input
   * @param input - An instance of this input type
   */
  addInput(inputType: InputType, input: IInput): void {
    this._inputInstances[inputType] = input;
  }

  /**
   * Whether the key is being held down, if there is no parameter, return whether any key is being held down.
   * @param key - The keys of the keyboard
   * @returns Whether the key is being held down
   */
  isKeyHeldDown(key?: Keys): boolean {
    const keyboardManager = this.getInput<KeyboardManager>(InputType.Keyboard);
    if (keyboardManager) {
      if (key === undefined) {
        return keyboardManager._curFrameHeldDownList.length > 0;
      } else {
        return keyboardManager._curHeldDownKeyToIndexMap[key] != null;
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
    const keyboardManager = this.getInput<KeyboardManager>(InputType.Keyboard);
    if (keyboardManager) {
      if (key === undefined) {
        return keyboardManager._curFrameDownList.length > 0;
      } else {
        return keyboardManager._downKeyToFrameCountMap[key] === this._engine.time._frameCount;
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
    const keyboardManager = this.getInput<KeyboardManager>(InputType.Keyboard);
    if (keyboardManager) {
      if (key === undefined) {
        return keyboardManager._curFrameUpList.length > 0;
      } else {
        return keyboardManager._upKeyToFrameCountMap[key] === this._engine.time._frameCount;
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
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    if (pointerManager) {
      if (pointerButton === undefined) {
        return pointerManager._buttons !== 0;
      } else {
        return (pointerManager._buttons & pointerButton) !== 0;
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
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    if (pointerManager) {
      if (pointerButton === undefined) {
        return pointerManager._downList.length > 0;
      } else {
        return pointerManager._downMap[_pointerBin2DecMap[pointerButton]] === this._engine.time._frameCount;
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
    const pointerManager = this.getInput<PointerManager>(InputType.Pointer);
    if (pointerManager) {
      if (pointerButton === undefined) {
        return pointerManager._upList.length > 0;
      } else {
        return pointerManager._upMap[_pointerBin2DecMap[pointerButton]] === this._engine.time._frameCount;
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
    const canvas = engine.canvas._webCanvas;
    if (typeof OffscreenCanvas === "undefined" || !(canvas instanceof OffscreenCanvas)) {
      this.addInput(InputType.Wheel, new WheelManager(engine));
      this.addInput(InputType.Pointer, new PointerManager(engine));
      this.addInput(InputType.Keyboard, new KeyboardManager(engine));
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
    if (!this._initialized) {
      return;
    }
    const { _inputInstances: inputInstances } = this;
    for (let i = 0, l = InputType.length; i < l; i++) {
      inputInstances[i]?._update();
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (!this._initialized) {
      return;
    }
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("focus", this._onFocus);
    const { _inputInstances: inputInstances } = this;
    for (let i = 0, l = InputType.length; i < l; i++) {
      inputInstances[i]?._destroy();
    }
  }

  private _onBlur(): void {
    const { _inputInstances: inputInstances } = this;
    for (let i = 0, l = InputType.length; i < l; i++) {
      inputInstances[i] && (inputInstances[i].focus = false);
    }
  }

  private _onFocus(): void {
    const { _inputInstances: inputInstances } = this;
    for (let i = 0, l = InputType.length; i < l; i++) {
      inputInstances[i] && (inputInstances[i].focus = true);
    }
  }
}
