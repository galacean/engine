
import { DisorderedArray } from "../../DisorderedArray";
import { KeyCode } from "./KeyCode";

/**
 * Keyboard Manager.
 * @internal
 */
export class KeyboardManager {
    /** @internal */
    _curFrameCount = 0;
    /** @internal */
    _curHeldDownKey2IndexMap: number[] = [];
    /** @internal */
    _curFrameUpKey2FrameCountMap: number[] = [];
    /** @internal */
    _curFrameDownKey2FrameCountMap: number[] = [];

    /** @internal */
    _curFrameHeldDownList: DisorderedArray<KeyCode> = new DisorderedArray();
    /** @internal */
    _curFrameDownList: DisorderedArray<KeyCode> = new DisorderedArray();
    /** @internal */
    _curFrameUpList: DisorderedArray<KeyCode> = new DisorderedArray();

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
    _update() {
        this._curFrameCount++;
        const { _nativeEvents, _curFrameDownList, _curFrameUpList } = this;
        _curFrameDownList.length = 0;
        _curFrameUpList.length = 0;
        if (_nativeEvents.length > 0) {
            const { _curFrameCount, _curHeldDownKey2IndexMap, _curFrameHeldDownList } = this;
            for (let i = 0, n = _nativeEvents.length; i < n; i++) {
                const evt = _nativeEvents[i];
                const codeNumber: KeyCode = KeyCode[evt.code];
                switch (evt.type) {
                    case 'keydown':
                        if (!_curHeldDownKey2IndexMap[codeNumber]) {
                            _curFrameDownList.add(codeNumber);
                            _curFrameHeldDownList.add(codeNumber);
                            _curHeldDownKey2IndexMap[codeNumber] = _curFrameHeldDownList.length;
                            this._curFrameDownKey2FrameCountMap[codeNumber] = _curFrameCount;
                        }
                        break;
                    case 'keyup':
                        const delIndex = _curHeldDownKey2IndexMap[codeNumber];
                        if (delIndex) {
                            _curHeldDownKey2IndexMap[codeNumber] = null;
                            const swapCode = _curFrameHeldDownList.deleteByIndex(delIndex - 1);
                            swapCode && (_curHeldDownKey2IndexMap[swapCode] = delIndex);
                        }
                        _curFrameUpList.add(codeNumber);
                        this._curFrameUpKey2FrameCountMap[codeNumber] = _curFrameCount;
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
    _onBlur() {
        const { _curHeldDownKey2IndexMap } = this;
        for (let i = _curHeldDownKey2IndexMap.length - 1; i >= 0; i--) {
            _curHeldDownKey2IndexMap[i] && (_curHeldDownKey2IndexMap[i] = null);
        }
        this._nativeEvents.length = 0;
        this._curFrameHeldDownList.length = 0;
        this._curFrameDownList.length = 0;
        this._curFrameUpList.length = 0;
    }

    /**
     * @internal
     */
    _destroy() {
        window.removeEventListener('keydown', this._onKeyEvent);
        window.removeEventListener('keyup', this._onKeyEvent);
        this._curHeldDownKey2IndexMap.length = 0;
        this._curFrameUpKey2FrameCountMap.length = 0;
        this._curFrameDownKey2FrameCountMap.length = 0;
        this._nativeEvents.length = 0;

        this._curFrameHeldDownList.garbageCollection();
        this._curFrameDownList.garbageCollection();
        this._curFrameUpList.garbageCollection();
    }
}