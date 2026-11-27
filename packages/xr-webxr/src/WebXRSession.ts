import { RHIBackend, type WebGLGraphicDevice } from "@galacean/engine";
import { IXRInputEvent, IXRSession } from "@galacean/engine-design";
import { XRInputEventType, XRTargetRayMode, XRTrackedInputDevice } from "@galacean/engine-xr";
import { getInputSource } from "./Util";
import type { WebXRGPUBinding, XRProjectionDevice, XRProjectionTarget } from "./WebXRProjection";
import { WebXRFrame } from "./WebXRFrame";

export class WebXRSession implements IXRSession {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  /** @internal */
  _onSessionExitCallBack: (() => void) | null;

  /** @internal */
  _platformSession: XRSession;
  /** @internal */
  _platformLayer: XRWebGLLayer | XRProjectionLayer;
  private _targets: Partial<Record<XREye, XRProjectionTarget>> = {};
  /** @internal */
  _platformReferenceSpace: XRReferenceSpace;

  private _frame: WebXRFrame;
  private _events: IXRInputEvent[] = [];
  private _screenPointers: (XRInputSource | null)[] = [];
  private _inputEventTypeMap: Record<string, number> = {
    selectstart: XRInputEventType.SelectStart,
    select: XRInputEventType.Select,
    selectend: XRInputEventType.SelectEnd,
    squeezestart: XRInputEventType.SqueezeStart,
    squeeze: XRInputEventType.Squeeze,
    squeezeend: XRInputEventType.SqueezeEnd
  };
  private _targetRayModeMap: Record<string, number> = {
    gaze: XRTargetRayMode.Gaze,
    "tracked-pointer": XRTargetRayMode.TrackedPointer,
    screen: XRTargetRayMode.Screen
  };

  get frame(): WebXRFrame {
    return this._frame;
  }

  get framebufferWidth(): number {
    return "textureWidth" in this._platformLayer
      ? this._platformLayer.textureWidth
      : this._platformLayer.framebufferWidth;
  }

  get framebufferHeight(): number {
    return "textureHeight" in this._platformLayer
      ? this._platformLayer.textureHeight
      : this._platformLayer.framebufferHeight;
  }

  get depthNear(): number | undefined {
    return this._platformSession.renderState?.depthNear;
  }

  get depthFar(): number | undefined {
    return this._platformSession.renderState?.depthFar;
  }

  get frameRate(): number | undefined {
    return this._platformSession.frameRate;
  }

  get supportedFrameRates(): Float32Array | undefined {
    return this._platformSession.supportedFrameRates;
  }

  get events(): IXRInputEvent[] {
    const { _events: events } = this;
    // Select event does not dispatch the move event, so we need to simulate dispatching the move here.
    const { _screenPointers: screenPointers } = this;
    for (let i = 0; i < screenPointers.length; i++) {
      const inputSource = screenPointers[i];
      if (!inputSource) continue;
      const { axes } = inputSource.gamepad!;
      const event = {
        type: XRInputEventType.Select,
        targetRayMode: XRTargetRayMode.Screen,
        input: XRTrackedInputDevice.Controller,
        id: i,
        x: axes[0],
        y: axes[1]
      };
      events.push(event);
    }
    return events;
  }

  constructor(
    private _rhi: WebGLGraphicDevice | XRProjectionDevice,
    session: XRSession,
    layer: XRWebGLLayer | XRProjectionLayer,
    referenceSpace: XRReferenceSpace,
    readonly gpuBinding?: WebXRGPUBinding
  ) {
    this._frame = new WebXRFrame(this);
    this._platformSession = session;
    this._platformLayer = layer;
    this._platformReferenceSpace = referenceSpace;
    const xrRequestAnimationFrame = session.requestAnimationFrame.bind(session);
    const onFrame = function (time: number, frame: XRFrame, callback: FrameRequestCallback) {
      this._frame._platformFrame = frame;
      try {
        callback(time);
      } finally {
        if (this.gpuBinding) {
          this.endView();
          this._targets.left = this._targets.right = this._targets.none = undefined;
          this._frame._platformFrame = null;
        }
      }
    }.bind(this);
    this.requestAnimationFrame = (callback: FrameRequestCallback) => {
      return xrRequestAnimationFrame((time: number, frame: XRFrame) => {
        onFrame(time, frame, callback);
      });
    };
    this.cancelAnimationFrame = session.cancelAnimationFrame.bind(session);
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onSessionExit = this._onSessionExit.bind(this);
  }

  getFixedFoveation(): number | undefined {
    return this._platformLayer.fixedFoveation;
  }

  setFixedFoveation(value: number) {
    this._platformLayer.fixedFoveation = value;
  }

  onUpdate(): void {
    const { _rhi: rhi, _platformLayer: layer } = this;
    if (rhi.backend === RHIBackend.WebGL2 && "framebuffer" in layer)
      rhi.setExternalFramebuffer(layer.framebuffer, layer.framebufferWidth, layer.framebufferHeight);
  }

  /** Record this frame's compositor images while the XRView is valid. */
  getViewport(view: XRView): XRViewport {
    const binding = this.gpuBinding;
    if (!binding) return (this._platformLayer as XRWebGLLayer).getViewport(view)!;
    const image = binding.getViewSubImage(this._platformLayer as XRProjectionLayer, view);
    this._targets[view.eye] = {
      color: image.colorTexture,
      depthStencil: image.depthStencilTexture ?? undefined,
      viewDescriptor: image.getViewDescriptor()
    };
    return image.viewport;
  }

  beginView(eye: XREye): boolean {
    if (this._rhi.backend === RHIBackend.WebGL2) return true;
    const target = this._targets[eye];
    if (!target) return false;
    this._rhi.setExternalProjectionTarget(target);
    return true;
  }

  endView(): void {
    if (this._rhi.backend === RHIBackend.WebGPU) this._rhi.setExternalProjectionTarget(null);
  }

  start(): void {}

  stop(): void {
    this._frame._platformFrame = null;
    this._clearMainFrameBuffer();
  }

  end(): Promise<void> {
    this._frame._platformFrame = null;
    this._clearMainFrameBuffer();
    return this._platformSession.end();
  }

  setSessionExitCallBack(onSessionExitCallBack: () => void): void {
    this._onSessionExitCallBack = onSessionExitCallBack;
  }

  addEventListener(): void {
    const { _onSessionEvent: onSessionEvent, _platformSession: session } = this;
    session.addEventListener("select", onSessionEvent);
    session.addEventListener("selectstart", onSessionEvent);
    session.addEventListener("selectend", onSessionEvent);
    session.addEventListener("squeeze", onSessionEvent);
    session.addEventListener("squeezestart", onSessionEvent);
    session.addEventListener("squeezeend", onSessionEvent);
    session.addEventListener("end", this._onSessionExit);
  }

  removeEventListener(): void {
    const { _onSessionEvent: onSessionEvent, _platformSession: session } = this;
    session.removeEventListener("select", onSessionEvent);
    session.removeEventListener("selectstart", onSessionEvent);
    session.removeEventListener("selectend", onSessionEvent);
    session.removeEventListener("squeeze", onSessionEvent);
    session.removeEventListener("squeezestart", onSessionEvent);
    session.removeEventListener("squeezeend", onSessionEvent);
    session.removeEventListener("end", this._onSessionExit);
    this._events.length = 0;
  }

  resetEvents(): void {
    this._events.length = 0;
  }

  private _onSessionExit(): void {
    this._clearMainFrameBuffer();
    if (this._onSessionExitCallBack) {
      this._onSessionExitCallBack();
      this._onSessionExitCallBack = null;
    }
  }

  private _clearMainFrameBuffer(): void {
    if (this._rhi.backend === RHIBackend.WebGL2) this._rhi.setExternalFramebuffer(null, 0, 0);
    else {
      this.endView();
      this._targets.left = this._targets.right = this._targets.none = undefined;
    }
  }

  private _onSessionEvent(inputSourceEvent: XRInputSourceEvent): void {
    const { inputSource } = inputSourceEvent;
    const event: IXRInputEvent = {
      type: this._inputEventTypeMap[inputSourceEvent.type],
      input: getInputSource(inputSource)!,
      targetRayMode: this._targetRayModeMap[inputSource.targetRayMode]
    };
    if (event.targetRayMode === XRTargetRayMode.Screen) {
      const { _screenPointers: screenPointers } = this;
      const { axes } = inputSource.gamepad!;
      event.x = axes[0];
      event.y = axes[1];
      switch (event.type) {
        case XRInputEventType.SelectStart:
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
        case XRInputEventType.SelectEnd:
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
}
