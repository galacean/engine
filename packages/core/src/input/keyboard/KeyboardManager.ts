import { DisorderedArray } from "../../DisorderedArray";
import { Keys } from "../enums/Keys";
import { IInput } from "../interface/IInput";

/**
 * Keyboard Manager.
 * @internal
 */
export class KeyboardManager implements IInput {
  /** @internal */
  _curHeldDownKeyToIndexMap: number[] = [];
  /** @internal */
  _upKeyToFrameCountMap: number[] = [];
  /** @internal */
  _downKeyToFrameCountMap: number[] = [];

  /** @internal */
  _curFrameHeldDownList: DisorderedArray<Keys> = new DisorderedArray();
  /** @internal */
  _curFrameDownList: DisorderedArray<Keys> = new DisorderedArray();
  /** @internal */
  _curFrameUpList: DisorderedArray<Keys> = new DisorderedArray();

  private _htmlCanvas: HTMLCanvasElement;
  private _nativeEvents: KeyboardEvent[] = [];
  private _hadListener: boolean = false;

  /**
   * Create a KeyboardManager.
   */
  constructor(htmlCanvas: HTMLCanvasElement) {
    this._htmlCanvas = htmlCanvas;
    // Need to set tabIndex to make the canvas focus.
    htmlCanvas.tabIndex = htmlCanvas.tabIndex;
    this._onKeyEvent = this._onKeyEvent.bind(this);
    htmlCanvas.addEventListener("keydown", this._onKeyEvent);
    htmlCanvas.addEventListener("keyup", this._onKeyEvent);
    this._hadListener = true;
  }

  /**
   * @internal
   */
  _update(frameCount: number): void {
    const { _nativeEvents: nativeEvents, _curFrameDownList: curFrameDownList, _curFrameUpList: curFrameUpList } = this;
    curFrameDownList.length = 0;
    curFrameUpList.length = 0;
    if (nativeEvents.length > 0) {
      const {
        _curHeldDownKeyToIndexMap: curHeldDownKeyToIndexMap,
        _curFrameHeldDownList: curFrameHeldDownList,
        _downKeyToFrameCountMap: downKeyToFrameCountMap,
        _upKeyToFrameCountMap: upKeyToFrameCountMap
      } = this;
      for (let i = 0, n = nativeEvents.length; i < n; i++) {
        const evt = nativeEvents[i];
        const codeKey = <Keys>Keys[evt.code];
        switch (evt.type) {
          case "keydown":
            // Filter the repeated triggers of the keyboard.
            if (curHeldDownKeyToIndexMap[codeKey] == null) {
              curFrameDownList.add(codeKey);
              curFrameHeldDownList.add(codeKey);
              curHeldDownKeyToIndexMap[codeKey] = curFrameHeldDownList.length - 1;
              downKeyToFrameCountMap[codeKey] = frameCount;
            }
            break;
          case "keyup":
            const delIndex = curHeldDownKeyToIndexMap[codeKey];
            if (delIndex != null) {
              curHeldDownKeyToIndexMap[codeKey] = null;
              const swapCode = curFrameHeldDownList.deleteByIndex(delIndex);
              swapCode && (curHeldDownKeyToIndexMap[swapCode] = delIndex);
            }
            curFrameUpList.add(codeKey);
            upKeyToFrameCountMap[codeKey] = frameCount;
            break;
          default:
            break;
        }
      }
      nativeEvents.length = 0;
    }
  }

  /**
   * @internal
   */
  _onFocus(): void {
    if (!this._hadListener) {
      this._htmlCanvas.addEventListener("keydown", this._onKeyEvent);
      this._htmlCanvas.addEventListener("keyup", this._onKeyEvent);
      this._hadListener = true;
    }
  }

  /**
   * @internal
   */
  _onBlur(): void {
    if (this._hadListener) {
      this._htmlCanvas.removeEventListener("keydown", this._onKeyEvent);
      this._htmlCanvas.removeEventListener("keyup", this._onKeyEvent);
      this._curHeldDownKeyToIndexMap.length = 0;
      this._curFrameHeldDownList.length = 0;
      this._curFrameDownList.length = 0;
      this._curFrameUpList.length = 0;
      this._nativeEvents.length = 0;
      this._hadListener = false;
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._hadListener) {
      this._htmlCanvas.removeEventListener("keydown", this._onKeyEvent);
      this._htmlCanvas.removeEventListener("keyup", this._onKeyEvent);
      this._hadListener = false;
    }
    this._curHeldDownKeyToIndexMap = null;
    this._upKeyToFrameCountMap = null;
    this._downKeyToFrameCountMap = null;
    this._nativeEvents = null;

    this._curFrameHeldDownList = null;
    this._curFrameDownList = null;
    this._curFrameUpList = null;
  }

  private _onKeyEvent(evt: KeyboardEvent): void {
    this._nativeEvents.push(evt);
  }
}
