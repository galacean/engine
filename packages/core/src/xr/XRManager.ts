import { Logger } from "../base";
import { EnumXREvent } from "./enum/EnumXREvent";
import { EnumXRMode } from "./enum/EnumXRMode";

export class XRManager {
  private _mode: EnumXRMode;
  private _optional: XRSessionInit;
  private _session: XRSession;
  private _requestId: number;
  private _isPaused: boolean = true;

  isSupported(mode: EnumXRMode): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => any) => {
      if (window.isSecureContext === false) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)"));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      navigator.xr.isSessionSupported(mode).then((isSupported: boolean) => {
        if (isSupported) {
          resolve();
        } else {
          reject(new Error("The current context doesn't support WebXR"));
        }
      });
    });
  }

  init(mode: EnumXRMode, optional?: XRSessionInit): Promise<void> {
    return new Promise((resolve: () => any, reject: (error: Error) => any) => {
      if (this._session) {
        resolve();
        return;
      }
      navigator.xr.requestSession(mode, optional).then((session: XRSession) => {
        this._mode = mode;
        this._optional = optional;
        this._session = session;
        this._addXRListener();
        resolve();
      }, reject);
    });
  }

  run(): void {
    this.resume();
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    if (!this._session) {
      Logger.warn("There are currently no available sessions");
      return;
    }
    if (!this._isPaused) return;
    this._isPaused = false;
    // this._requestId = requestAnimationFrame(this._animate);
  }

  destroy(): void {
    this._removeXRListener();
    this._mode = null;
    this._optional = null;
    this._session = null;
  }

  constructor() {
    // end
    this._onEnd = this._onEnd.bind(this);
    // select
    this._onSelect = this._onSelect.bind(this);
    this._onSelectStart = this._onSelectStart.bind(this);
    this._onSelectEnd = this._onSelectEnd.bind(this);
    // squeeze
    this._onSqueeze = this._onSqueeze.bind(this);
    this._onSqueezeStart = this._onSqueezeStart.bind(this);
    this._onSqueezeEnd = this._onSqueezeEnd.bind(this);
    // input
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
  }

  private _addXRListener() {
    this._session.addEventListener(EnumXREvent.End, this._onEnd);
  }

  private _removeXRListener() {
    this._session.removeEventListener(EnumXREvent.End, this._onEnd);
  }

  private _onEnd(event: Event) {
    this.destroy();
  }

  private _onSelect(event: Event) {}
  private _onSelectStart(event: Event) {}
  private _onSelectEnd(event: Event) {}
  private _onSqueeze(event: Event) {}
  private _onSqueezeStart(event: Event) {}
  private _onSqueezeEnd(event: Event) {}
  private _onInputSourcesChange(event: Event) {}
}
