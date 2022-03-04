import { Engine } from "../..";
import { KeyEvent } from "./KeyEvent";
import { KeyCode } from "./KeyCode";
import { ComponentsManager } from "../../ComponentsManager";
import { ClassPool } from "../../RenderPipeline/ClassPool";

/**
 * Keyboard Manager.
 * @internal
 */
export class KeyboardManager {
    /** @internal */
    _curFrameCount = 0;
    /** @internal */
    _curKeyState: boolean[] = [];
    /** @internal */
    _curFrameKeyUp: number[] = [];
    /** @internal */
    _curFrameKeyDown: number[] = [];

    private _nativeEvents: KeyboardEvent[] = [];
    private _componentsManager: ComponentsManager;
    private _keyEvtPool: ClassPool<KeyEvent> = new ClassPool(KeyEvent);

    private _onKeyEvent: (evt: KeyboardEvent) => void;

    /**
     * Create a KeyboardManager.
     * @param engine - The current engine instance
     */
    constructor(engine: Engine) {
        this._componentsManager = engine._componentsManager;
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
        const { _nativeEvents } = this;
        this._curFrameCount = this._curFrameCount + 1;
        if (_nativeEvents.length > 0) {
            const { _curFrameCount, _curKeyState, _componentsManager, _keyEvtPool } = this;
            for (let i = 0, n = _nativeEvents.length; i < n; i++) {
                const evt = _nativeEvents[i];
                const codeNumber: KeyCode = KeyCode[evt.code];
                switch (evt.type) {
                    case 'keydown':
                        if (!_curKeyState[codeNumber]) {
                            _curKeyState[codeNumber] = true;
                            this._curFrameKeyDown[codeNumber] = _curFrameCount;
                            const keyEvt = _keyEvtPool.getFromPool();
                            keyEvt.setValue(evt.key, evt.code, codeNumber)
                            _componentsManager.callScriptOnKeyDown(keyEvt);
                        }
                        break;
                    case 'keyup':
                        _curKeyState[codeNumber] = false;
                        this._curFrameKeyUp[codeNumber] = _curFrameCount;
                        const keyEvt = _keyEvtPool.getFromPool();
                        keyEvt.setValue(evt.key, evt.code, codeNumber)
                        _componentsManager.callScriptOnKeyUp(keyEvt);
                        break;
                    default:
                        break;
                }
            }
            _keyEvtPool.resetPool();
            _nativeEvents.length = 0;
        }
    }

    /**
     * @internal
     */
    _destroy() {
        window.removeEventListener('keydown', this._onKeyEvent);
        window.removeEventListener('keyup', this._onKeyEvent);
        this._curKeyState.length = 0;
        this._curFrameKeyUp.length = 0;
        this._curFrameKeyDown.length = 0;
        this._nativeEvents.length = 0;
        this._componentsManager = null;
    }
}