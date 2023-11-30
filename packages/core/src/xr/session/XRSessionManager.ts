import { IHardwareRenderer, IXRFeature, IXRSession } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRSessionMode } from "./XRSessionMode";
import { XRSessionState } from "./XRSessionState";

/**
 * XRSessionManager manages the life cycle of XR sessions.
 */
export class XRSessionManager {
  private _mode: XRSessionMode = XRSessionMode.None;
  private _session: IXRSession;
  private _state: XRSessionState = XRSessionState.None;
  private _rhi: IHardwareRenderer;
  private _raf: (callback: FrameRequestCallback) => number;
  private _caf: (id: number) => void;

  /**
   * The current session mode( AR or VR ).
   */
  get mode(): XRSessionMode {
    return this._mode;
  }

  /**
   * Return the current session state.
   */
  get state(): XRSessionState {
    return this._state;
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
   * Check if the specified mode is supported.
   * @param mode - The mode to check
   * @returns A promise that resolves if the mode is supported, otherwise rejects
   */
  isSupportedMode(mode: XRSessionMode): Promise<void> {
    return this._engine.xrManager._xrDevice.isSupportedSessionMode(mode);
  }

  /**
   * @internal
   * Return the current session.
   */
  get session(): IXRSession {
    return this._session;
  }

  /**
   * @internal
   */
  constructor(protected _engine: Engine) {
    this._rhi = _engine._hardwareRenderer;
    this._raf = requestAnimationFrame.bind(window);
    this._caf = cancelAnimationFrame.bind(window);
  }

  /**
   * @internal
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
   * @internal
   * Returns cancelAnimationFrame in XR.
   */
  get cancelAnimationFrame(): (id: number) => void {
    if (this._state === XRSessionState.Running) {
      return this._session.cancelAnimationFrame;
    } else {
      return this._caf;
    }
  }

  /**
   * Run the session.
   */
  run(): void {
    const { _session: session } = this;
    if (!session) {
      throw new Error("Without session to run.");
    }
    session.start();
    this._state = XRSessionState.Running;
    const { xrManager } = this._engine;
    xrManager.inputManager._onSessionStart();
    const features = xrManager.getFeatures();
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onSessionStart();
    }
  }

  /**
   * Stop the session.
   */
  stop(): void {
    const { _session: session, _engine: engine } = this;
    if (!session) {
      throw new Error("Without session to stop.");
    }
    const isRunning = !engine.isPaused;
    isRunning && engine.pause();
    session.stop();
    const { _rhi: rhi } = this;
    rhi._mainFrameBuffer = null;
    rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
    this._state = XRSessionState.Paused;
    isRunning && engine.resume();
    const { xrManager } = engine;
    xrManager.inputManager._onSessionStop();
    const features = xrManager.getFeatures();
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onSessionStop();
    }
  }

  /**
   * @internal
   */
  _initialize(mode: XRSessionMode, features: IXRFeature[]): Promise<IXRSession> {
    return new Promise((resolve, reject) => {
      this._engine.xrManager._xrDevice.requestSession(this._rhi, mode, features).then((session: IXRSession) => {
        this._mode = mode;
        this._session = session;
        this._state = XRSessionState.Initialized;
        resolve(session);
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
  _onDestroy(): void {}
}
