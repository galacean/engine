import { IXRSession, IXRInputEvent } from "@galacean/engine-design";
import { XRInputEvent, XRInputType } from "@galacean/engine";
import { getInputSource } from "./util";
import { WebXRFrame } from "./WebXRFrame";

export class WebXRSession implements IXRSession {
  // @internal
  _platformSession: XRSession;
  // @internal
  _platformLayer: XRWebGLLayer;
  // @internal
  _platformReferenceSpace: XRReferenceSpace;
  // @internal
  _platformFrame: XRFrame;

  private _frame: WebXRFrame;
  private _events: XRInputEvent[] = [];
  private _screenPointers: XRInputSource[] = [];
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;

  get frame(): WebXRFrame {
    if (this._platformFrame) {
      this._frame ||= new WebXRFrame(this);
      this._frame._platformFrame = this._platformFrame;
      return this._frame;
    }
  }

  get fixedFoveation(): number {
    return this._platformLayer.fixedFoveation;
  }

  set fixedFoveation(value: number) {
    this._platformLayer.fixedFoveation = value;
  }

  get framebuffer(): WebGLFramebuffer {
    return this._platformLayer.framebuffer;
  }

  get framebufferWidth(): number {
    return this._platformLayer.framebufferWidth;
  }

  get framebufferHeight(): number {
    return this._platformLayer.framebufferHeight;
  }

  get frameRate(): number {
    return this._platformSession.frameRate;
  }

  get supportedFrameRates(): Float32Array {
    return this._platformSession.supportedFrameRates;
  }

  getEvents(): IXRInputEvent[] {
    const { _events: events } = this;
    // Select event does not dispatch the move event, so we need to simulate dispatching the move here
    const { _screenPointers: screenPointers } = this;
    for (let i = 0; i < screenPointers.length; i++) {
      const inputSource = screenPointers[i];
      if (!inputSource) continue;
      const axes = inputSource.gamepad;
      const event = new XRInputEvent();
      event.type = "select";
      event.id = i;
      event.x = axes[0];
      event.y = axes[1];
      event.targetRayMode = "screen";
      event.input = XRInputType.Controller;
      events.unshift(event);
    }
    return events;
  }

  resetEvents(): void {
    this._events.length = 0;
  }

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  start(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  stop(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been shut down.
   */
  end(): Promise<void> {
    return this._platformSession.end();
  }

  constructor(session: XRSession, layer: XRWebGLLayer, referenceSpace: XRReferenceSpace) {
    this._platformSession = session;
    this._platformLayer = layer;
    this._platformReferenceSpace = referenceSpace;
    const xrRequestAnimationFrame = session.requestAnimationFrame.bind(session);
    const onFrame = function (time: number, frame: XRFrame, callback: FrameRequestCallback) {
      this._platformFrame = frame;
      callback(time);
    }.bind(this);

    this.requestAnimationFrame = (callback: FrameRequestCallback) => {
      return xrRequestAnimationFrame((time: number, frame: XRFrame) => {
        onFrame(time, frame, callback);
      });
    };
    this.cancelAnimationFrame = session.cancelAnimationFrame.bind(session);
  }

  private _onSessionEvent(inputSourceEvent: XRInputSourceEvent) {
    const event = new XRInputEvent();
    event.type = inputSourceEvent.type;
    event.input = getInputSource(inputSourceEvent.inputSource);
    const { inputSource } = inputSourceEvent;
    const targetRayMode = (event.targetRayMode = inputSource.targetRayMode);
    if (targetRayMode === "screen") {
      const { _screenPointers: screenPointers } = this;
      const { axes } = inputSource.gamepad;
      event.x = axes[0];
      event.y = axes[1];
      switch (inputSourceEvent.type) {
        case "selectstart":
          let idx = -1;
          let emptyIdx = -1;
          for (let i = screenPointers.length - 1; i >= 0; i--) {
            const pointer = screenPointers[i];
            if (pointer === inputSource) {
              idx = i;
              break;
            }
            if (!pointer) {
              emptyIdx = i;
            }
          }
          if (idx === -1) {
            if (emptyIdx === -1) {
              idx = screenPointers.push(inputSource) - 1;
            } else {
              idx = emptyIdx;
              screenPointers[emptyIdx] = inputSource;
            }
          }
          event.id = idx;
          break;
        case "selectend":
          for (let i = screenPointers.length - 1; i >= 0; i--) {
            if (screenPointers[i] === inputSource) {
              screenPointers[i] = null;
              event.id = i;
            }
          }
          break;
        default:
          break;
      }
    }
    this._events.push(event);
  }

  addEventListener(): void {
    const { _onSessionEvent: onSessionEvent, _platformSession: session } = this;
    session.addEventListener("select", onSessionEvent);
    session.addEventListener("selectstart", onSessionEvent);
    session.addEventListener("selectend", onSessionEvent);
    session.addEventListener("squeeze", onSessionEvent);
    session.addEventListener("squeezestart", onSessionEvent);
    session.addEventListener("squeezeend", onSessionEvent);
  }

  removeEventListener(): void {
    const { _onSessionEvent: onSessionEvent, _platformSession: session } = this;
    session.removeEventListener("select", onSessionEvent);
    session.removeEventListener("selectstart", onSessionEvent);
    session.removeEventListener("selectend", onSessionEvent);
    session.removeEventListener("squeeze", onSessionEvent);
    session.removeEventListener("squeezestart", onSessionEvent);
    session.removeEventListener("squeezeend", onSessionEvent);
    this._events.length = 0;
  }
}
