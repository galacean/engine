
import { DisorderedArray } from "../../DisorderedArray";
import { Keys } from "../enums/Keys";

/**
 * Keyboard Manager.
 * @internal
 */
export class KeyboardManager {
    /** @internal */
    _curFrameCount: number = 0;
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
    private _onKeyEvent: (evt: KeyboardEvent) => void;

    /**
     * Create a KeyboardManager.
     */
    constructor() {
        this._onKeyEvent = (evt: KeyboardEvent) => {
            this._nativeEvents.push(evt);
        }
        window.addEventListener('keydown', this._onKeyEvent);
        window.addEventListener('keyup', this._onKeyEvent);
    }

    /**
     * @internal
     */
    _update(): void {
        this._curFrameCount++;
        const { _nativeEvents, _curFrameDownList, _curFrameUpList } = this;
        _curFrameDownList.length = 0;
        _curFrameUpList.length = 0;
        if (_nativeEvents.length > 0) {
            const { _curFrameCount, _curHeldDownKeyToIndexMap, _curFrameHeldDownList } = this;
            for (let i = 0, n = _nativeEvents.length; i < n; i++) {
                const evt = _nativeEvents[i];
                const codeKey = <Keys>Keys[evt.code];
                switch (evt.type) {
                    case 'keydown':
                        // Filter the repeated triggers of the keyboard.
                        if (_curHeldDownKeyToIndexMap[codeKey] == null) {
                            _curFrameDownList.add(codeKey);
                            _curFrameHeldDownList.add(codeKey);
                            _curHeldDownKeyToIndexMap[codeKey] = _curFrameHeldDownList.length - 1;
                            this._downKeyToFrameCountMap[codeKey] = _curFrameCount;
                        }
                        break;
                    case 'keyup':
                        const delIndex = _curHeldDownKeyToIndexMap[codeKey];
                        if (delIndex != null) {
                            _curHeldDownKeyToIndexMap[codeKey] = null;
                            const swapCode = _curFrameHeldDownList.deleteByIndex(delIndex);
                            swapCode && (_curHeldDownKeyToIndexMap[swapCode] = delIndex);
                        }
                        _curFrameUpList.add(codeKey);
                        this._upKeyToFrameCountMap[codeKey] = _curFrameCount;
                        break;
                    default:
                        break;
                }
            }
            _nativeEvents.length = 0;
        }
    }

    /**
     * @internal
     */
    _onBlur(): void {
        this._curHeldDownKeyToIndexMap.length = 0;
        this._nativeEvents.length = 0;
        this._curFrameHeldDownList.length = 0;
        this._curFrameDownList.length = 0;
        this._curFrameUpList.length = 0;
    }

    /**
     * @internal
     */
    _destroy(): void {
        window.removeEventListener('keydown', this._onKeyEvent);
        window.removeEventListener('keyup', this._onKeyEvent);
        this._curHeldDownKeyToIndexMap = null;
        this._upKeyToFrameCountMap = null;
        this._downKeyToFrameCountMap = null;
        this._nativeEvents = null;

        this._curFrameHeldDownList = null;
        this._curFrameDownList = null;
        this._curFrameUpList = null;
    }
}