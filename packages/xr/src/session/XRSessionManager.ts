import { IHardwareRenderer, IXRSession } from "@galacean/engine-design";
import { XRFeature } from "../feature/XRFeature";
import { XRSessionMode } from "./XRSessionMode";
import { XRSessionState } from "./XRSessionState";
import { XRManagerExtended } from "../XRManagerExtended";

/**
 * XRSessionManager manages the life cycle of XR sessions.
 */
export class XRSessionManager {
  /** @internal */
  _platformSession: IXRSession;

  private _mode: XRSessionMode = XRSessionMode.None;
  private _state: XRSessionState = XRSessionState.None;
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
    return this._platformSession.supportedFrameRates;
  }

  /**
   * Return the current frame rate as reported by the device.
   */
  get frameRate(): number {
    return this._platformSession.frameRate;
  }

  /**
   * @internal
   */
  constructor(
    private _xrManager: XRManagerExtended,
    private _rhi: IHardwareRenderer
  ) {
    this._raf = requestAnimationFrame.bind(window);
    this._caf = cancelAnimationFrame.bind(window);
    this._onSessionExit = this._onSessionExit.bind(this);
  }

  /**
   * Check if the specified mode is supported.
   * @param mode - The mode to check
   * @returns A promise that resolves if the mode is supported, otherwise rejects
   */
  isSupportedMode(mode: XRSessionMode): Promise<void> {
    return this._xrManager._platformDevice.isSupportedSessionMode(mode);
  }

  /**
   * Run the session.
   */
  run(): void {
    const { _platformSession: platformSession } = this;
    if (!platformSession) {
      throw new Error("Without session to run.");
    }
    platformSession.start();
    this._state = XRSessionState.Running;
    this._xrManager._onSessionStart();
  }

  /**
   * Stop the session.
   */
  stop(): void {
    const { _platformSession: platformSession } = this;
    if (!platformSession) {
      throw new Error("Without session to stop.");
    }
    platformSession.stop();
    this._state = XRSessionState.Paused;
    this._xrManager._onSessionStop();
  }

  /**
   * @internal
   */
  _initialize(mode: XRSessionMode, features: XRFeature[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _xrManager: xrManager } = this;
      // Initialize all features
      const platformFeatures = [];
      for (let i = 0, n = features.length; i < n; i++) {
        const { _platformFeature: platformFeature } = features[i];
        platformFeature && platformFeatures.push(platformFeature);
      }
      xrManager._platformDevice
        .requestSession(this._rhi, mode, platformFeatures)
        .then((platformSession: IXRSession) => {
          this._mode = mode;
          this._platformSession = platformSession;
          this._state = XRSessionState.Initialized;
          platformSession.setSessionExitCallBack(this._onSessionExit);
          platformSession.addEventListener();
          xrManager._onSessionInit();
          resolve();
        }, reject);
    });
  }

  /**
   * @internal
   */
  _onUpdate() {
    const { _rhi: rhi, _platformSession: platformSession } = this;
    rhi._mainFrameBuffer = platformSession.framebuffer;
    rhi._mainFrameWidth = platformSession.framebufferWidth;
    rhi._mainFrameHeight = platformSession.framebufferHeight;
  }

  /**
   * @internal
   */
  _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number {
    if (this._state === XRSessionState.Running) {
      return this._platformSession.requestAnimationFrame;
    } else {
      return this._raf;
    }
  }

  /**
   * @internal
   */
  _getCancelAnimationFrame(): (id: number) => void {
    if (this._state === XRSessionState.Running) {
      return this._platformSession.cancelAnimationFrame;
    } else {
      return this._caf;
    }
  }

  /**
   * @internal
   */
  _end(): Promise<void> {
    const { _platformSession: platformSession } = this;
    if (!platformSession) {
      return Promise.reject("Without session to stop.");
    }
    return platformSession.end();
  }

  private _onSessionExit() {
    const { _rhi: rhi, _platformSession: platformSession } = this;
    rhi._mainFrameBuffer = null;
    rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
    platformSession.removeEventListener();
    this._platformSession = null;
    this._state = XRSessionState.None;
    this._xrManager._onSessionExit();
  }

  /**
   * @internal
   */
  _onDestroy(): void {}
}
