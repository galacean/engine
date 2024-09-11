import { Engine } from "../../Engine";
import { Platform } from "../../Platform";
import { SystemInfo } from "../../SystemInfo";
import { DisorderedArray } from "../../utils/DisorderedArray";
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

  // @internal
  _target: EventTarget;
  private _engine: Engine;
  private _nativeEvents: KeyboardEvent[] = [];

  /**
   * @internal
   */
  constructor(engine: Engine, target: EventTarget) {
    this._engine = engine;
    this._onBlur = this._onBlur.bind(this);
    this._onKeyEvent = this._onKeyEvent.bind(this);
    this._target = target;
    this._addEventListener();
  }

  /**
   * @internal
   */
  _update(): void {
    const { _nativeEvents: nativeEvents, _curFrameDownList: curFrameDownList, _curFrameUpList: curFrameUpList } = this;
    curFrameDownList.length = 0;
    curFrameUpList.length = 0;
    if (nativeEvents.length > 0) {
      const frameCount = this._engine.time.frameCount;
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
            // Because on the mac, the keyup event is not responded to when the meta key is held down,
            // in order to maintain the correct keystroke record, it is necessary to clear the record
            // when the meta key is lifted.
            // link: https://stackoverflow.com/questions/11818637/why-does-javascript-drop-keyup-events-when-the-metakey-is-pressed-on-mac-browser
            if (SystemInfo.platform === Platform.Mac && (codeKey === Keys.MetaLeft || codeKey === Keys.MetaRight)) {
              for (let i = 0, n = curFrameHeldDownList.length; i < n; i++) {
                curHeldDownKeyToIndexMap[curFrameHeldDownList.get(i)] = null;
              }
              curFrameHeldDownList.length = 0;
            }
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
  _destroy(): void {
    this._removeEventListener();
    this._curHeldDownKeyToIndexMap.length = 0;
    this._curHeldDownKeyToIndexMap = null;
    this._upKeyToFrameCountMap.length = 0;
    this._upKeyToFrameCountMap = null;
    this._downKeyToFrameCountMap.length = 0;
    this._downKeyToFrameCountMap = null;
    this._nativeEvents.length = 0;
    this._nativeEvents = null;
    this._curFrameHeldDownList.length = 0;
    this._curFrameHeldDownList = null;
    this._curFrameDownList.length = 0;
    this._curFrameDownList = null;
    this._curFrameUpList.length = 0;
    this._curFrameUpList = null;
    this._engine = null;
  }

  private _onBlur() {
    this._curHeldDownKeyToIndexMap.length = 0;
    this._curFrameHeldDownList.length = 0;
    this._curFrameDownList.length = 0;
    this._curFrameUpList.length = 0;
    this._nativeEvents.length = 0;
  }

  private _onKeyEvent(evt: KeyboardEvent): void {
    this._nativeEvents.push(evt);
  }

  private _addEventListener(): void {
    const { _target: target } = this;
    target.addEventListener("keydown", this._onKeyEvent);
    target.addEventListener("keyup", this._onKeyEvent);
    target.addEventListener("blur", this._onBlur);
  }

  private _removeEventListener(): void {
    const { _target: target } = this;
    target.removeEventListener("keydown", this._onKeyEvent);
    target.removeEventListener("keyup", this._onKeyEvent);
    target.removeEventListener("blur", this._onBlur);
  }
}
