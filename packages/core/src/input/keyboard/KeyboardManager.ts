
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
    _curFrameUpKeyToFrameCountMap: number[] = [];
    /** @internal */
    _curFrameDownKeyToFrameCountMap: number[] = [];

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
                const codeNumber: Keys = Keys[evt.code];
                switch (evt.type) {
                    case 'keydown':
                        // Filter the repeated triggers of the keyboard.
                        if (_curHeldDownKeyToIndexMap[codeNumber] == null) {
                            _curFrameDownList.add(codeNumber);
                            _curFrameHeldDownList.add(codeNumber);
                            _curHeldDownKeyToIndexMap[codeNumber] = _curFrameHeldDownList.length - 1;
                            this._curFrameDownKeyToFrameCountMap[codeNumber] = _curFrameCount;
                        }
                        break;
                    case 'keyup':
                        const delIndex = _curHeldDownKeyToIndexMap[codeNumber];
                        if (delIndex != null) {
                            _curHeldDownKeyToIndexMap[codeNumber] = null;
                            const swapCode = _curFrameHeldDownList.deleteByIndex(delIndex);
                            swapCode && (_curHeldDownKeyToIndexMap[swapCode] = delIndex);
                        }
                        _curFrameUpList.add(codeNumber);
                        this._curFrameUpKeyToFrameCountMap[codeNumber] = _curFrameCount;
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
        const { _curHeldDownKeyToIndexMap } = this;
        for (let i = _curHeldDownKeyToIndexMap.length - 1; i >= 0; i--) {
            _curHeldDownKeyToIndexMap[i] && (_curHeldDownKeyToIndexMap[i] = null);
        }
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
        this._curHeldDownKeyToIndexMap.length = 0;
        this._curFrameUpKeyToFrameCountMap.length = 0;
        this._curFrameDownKeyToFrameCountMap.length = 0;
        this._nativeEvents.length = 0;

        this._curFrameHeldDownList.garbageCollection();
        this._curFrameDownList.garbageCollection();
        this._curFrameUpList.garbageCollection();
    }
}