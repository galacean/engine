import { IXRFrame, IXRSession, IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRSessionType } from "./XRSessionType";
import { XRSessionState } from "./XRSessionState";
import { IHardwareRenderer } from "../../renderingHardwareInterface";
import { Utils } from "../../Utils";

type TXRSessionStateChangeListener = (from: XRSessionState, to: XRSessionState) => void;
export class XRSessionManager {
  protected _session: IXRSession;
  protected _frame: IXRFrame;
  protected _state: XRSessionState = XRSessionState.None;
  private _rhi: IHardwareRenderer;
  private _listeners: TXRSessionStateChangeListener[] = [];

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
      return requestAnimationFrame;
    }
  }

  /**
   * Returns cancelAnimationFrame in XR.
   */
  get cancelAnimationFrame(): (id: number) => void {
    if (this._state === XRSessionState.Running) {
      return this._session.cancelAnimationFrame;
    } else {
      return cancelAnimationFrame;
    }
  }

  /**
   * Initialize the session.
   * @param mode - The mode of the session
   * @param requestFeatures - The requested features
   * @returns The promise of the session
   */
  initialize(mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<IXRSession> {
    const { _engine: engine } = this;
    const device = engine.xrManager.xrDevice;
    return new Promise((resolve, reject) => {
      device.requestSession(engine, mode, requestFeatures).then((session: IXRSession) => {
        this._session = session;
        this._state = XRSessionState.Initialized;
        resolve(session);
      }, reject);
    });
  }

  /**
   * Start the session.
   * @returns The promise of the session
   */
  start(): Promise<void> {
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
   * Stop the session.
   * @returns The promise of the session
   */
  stop(): Promise<void> {
    const { _session: session } = this;
    if (!session) {
      return Promise.reject("Without session to stop.");
    }
    return new Promise((resolve, reject) => {
      session.stop().then(() => {
        const { _rhi: rhi } = this;
        rhi._mainFrameBuffer = null;
        rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
        this._state = XRSessionState.Paused;
        resolve();
      }, reject);
    });
  }

  /**
   * Destroy the session.
   * @returns The promise of the session
   */
  destroy(): Promise<void> {
    const { _session: session } = this;
    if (!session) {
      return Promise.reject("Without session to stop.");
    }
    return new Promise((resolve, reject) => {
      const { _rhi: rhi } = this;
      rhi._mainFrameBuffer = null;
      rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
      session.end().then(() => {
        this._session = null;
        this._state = XRSessionState.None;
        resolve();
      }, reject);
    });
  }

  /**
   * Add a session state change listener.
   * @param listener - The listener to add
   */
  addSessionStateChangeListener(listener: TXRSessionStateChangeListener): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a session state change listener.
   * @param listener - The listener to remove
   */
  removeSessionStateChangeListener(listener: TXRSessionStateChangeListener): void {
    Utils.removeFromArray(this._listeners, listener);
  }

  /**
   * Remove all session state change listeners.
   */
  removeAllSessionStateChangeListener(): void {
    this._listeners.length = 0;
  }

  constructor(protected _engine: Engine) {
    this._rhi = _engine._hardwareRenderer;
  }

  // @internal
  _onUpdate() {
    const { _rhi: rhi, session } = this;
    rhi._mainFrameBuffer = session.framebuffer;
    rhi._mainFrameWidth = session.framebufferWidth;
    rhi._mainFrameHeight = session.framebufferHeight;
  }

  private _dispatchSessionStateChange(from: XRSessionState, to: XRSessionState): void {
    const listeners = this._listeners;
    for (let i = 0, n = listeners.length; i < n; i++) {
      listeners[i](from, to);
    }
  }
}
