import { DisorderedArray } from "../../DisorderedArray";
import { Keys } from "../enums/Keys";

/**
 * Keyboard Manager.
 * @internal
 */
export class KeyboardManager {
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

  private _nativeEvents: KeyboardEvent[] = [];

  /**
   * Create a KeyboardManager.
   */
  constructor() {
    this._onKeyEvent = this._onKeyEvent.bind(this);
    window.addEventListener("keydown", this._onKeyEvent);
    window.addEventListener("keyup", this._onKeyEvent);
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
            if (curHeldDownKeyToIndexMap[codeKey] === null) {
              curFrameDownList.add(codeKey);
              curFrameHeldDownList.add(codeKey);
              curHeldDownKeyToIndexMap[codeKey] = curFrameHeldDownList.length - 1;
              downKeyToFrameCountMap[codeKey] = frameCount;
            }
            break;
          case "keyup":
            const delIndex = curHeldDownKeyToIndexMap[codeKey];
            if (delIndex !== null) {
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
  _enable(): void {
    window.addEventListener("keydown", this._onKeyEvent);
    window.addEventListener("keyup", this._onKeyEvent);
  }

  /**
   * @internal
   */
  _disable(): void {
    window.removeEventListener("keydown", this._onKeyEvent);
    window.removeEventListener("keyup", this._onKeyEvent);
  }

  /**
   * @internal
   */
  _onBlur(): void {
    this._curHeldDownKeyToIndexMap.length = 0;
    this._curFrameHeldDownList.length = 0;
    this._curFrameDownList.length = 0;
    this._curFrameUpList.length = 0;
    this._nativeEvents.length = 0;
  }

  /**
   * @internal
   */
  _destroy(): void {
    window.removeEventListener("keydown", this._onKeyEvent);
    window.removeEventListener("keyup", this._onKeyEvent);
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
