import { IXRSession, IHardwareRenderer, IXRFeature } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRSessionMode } from "./XRSessionMode";
import { XRSessionState } from "./XRSessionState";

export class XRSessionManager {
  protected _session: IXRSession;
  protected _state: XRSessionState = XRSessionState.None;
  private _rhi: IHardwareRenderer;
  private _raf: (callback: FrameRequestCallback) => number;
  private _caf: (id: number) => void;

  /**
   * Return the current session state.
   */
  get state(): XRSessionState {
    return this._state;
  }

  /**
   * Return the current session.
   */
  get session(): IXRSession {
    return this._session;
  }

  /**
   * Return a list of supported frame rates.(only available in-session)
   */
  get supportedFrameRate(): Float32Array {
    return this._session.supportedFrameRates;
  }

  /**
   * Return the current frame rate as reported by the device.
   */
  get frameRate(): number {
    return this._session.frameRate;
  }

  /**
   * Returns requestAnimationFrame in XR.
   */
  get requestAnimationFrame(): (callback: FrameRequestCallback) => number {
    if (this._state === XRSessionState.Running) {
      return this._session.requestAnimationFrame;
    } else {
      return this._raf;
    }
  }

  /**
   * Returns cancelAnimationFrame in XR.
   */
  get cancelAnimationFrame(): (id: number) => void {
    if (this._state === XRSessionState.Running) {
      return this._session.cancelAnimationFrame;
    } else {
      return this._caf;
    }
  }

  constructor(protected _engine: Engine) {
    this._rhi = _engine._hardwareRenderer;
    this._raf = requestAnimationFrame.bind(window);
    this._caf = cancelAnimationFrame.bind(window);
  }

  /**
   * @internal
   */
  _initialize(mode: XRSessionMode, features: IXRFeature[]): Promise<IXRSession> {
    const { _xrDevice: xrDevice } = this._engine.xrManager;
    return new Promise((resolve, reject) => {
      xrDevice.requestSession(this._rhi, mode, features).then((session: IXRSession) => {
        this._session = session;
        this._state = XRSessionState.Initialized;
        resolve(session);
      }, reject);
    });
  }

  /**
   * @internal
   */
  _start(): Promise<void> {
    const { _session: session } = this;
    if (!session) {
      return Promise.reject("Without session to start.");
    }
    return new Promise((resolve, reject) => {
      session.start().then(() => {
        this._state = XRSessionState.Running;
        resolve();
      }, reject);
    });
  }

  /**
   * @internal
   */
  _stop(): Promise<void> {
    const { _session: session } = this;
    if (!session) {
      return Promise.reject("Without session to stop.");
    }
    const isRunning = !this._engine.isPaused;
    isRunning && this._engine.pause();
    return new Promise((resolve, reject) => {
      session.stop().then(() => {
        const { _rhi: rhi } = this;
        rhi._mainFrameBuffer = null;
        rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
        this._state = XRSessionState.Paused;
        isRunning && this._engine.resume();
        resolve();
      }, reject);
    });
  }

  /**
   * @internal
   */
  _destroy(): Promise<void> {
    const { _session: session } = this;
    if (!session) {
      return Promise.reject("Without session to stop.");
    }
    const isRunning = !this._engine.isPaused;
    isRunning && this._engine.pause();
    return new Promise((resolve, reject) => {
      const { _rhi: rhi } = this;
      rhi._mainFrameBuffer = null;
      rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
      session.end().then(() => {
        this._session = null;
        this._state = XRSessionState.None;
        isRunning && this._engine.resume();
        resolve();
      }, reject);
    });
  }

  /**
   * @internal
   */
  _onUpdate() {
    const { _rhi: rhi, session } = this;
    rhi._mainFrameBuffer = session.framebuffer;
    rhi._mainFrameWidth = session.framebufferWidth;
    rhi._mainFrameHeight = session.framebufferHeight;
  }

  /**
   * @internal
   */
  _onDestroy(): void {}
}
