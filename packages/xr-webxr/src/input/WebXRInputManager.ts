import {
  Engine,
  XRController,
  XRViewer,
  XRInput,
  EnumXRInputSource,
  EnumXRButton,
  XRInputManager,
  Vector4,
  Matrix
} from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";

export class WebXRInputManager extends XRInputManager {
  private _listeningSession: XRSession;
  private _pointerList: XRInputSource[] = [];
  private _canvas: HTMLCanvasElement;
  private _eventList: {
    event: Event;
    handle: (frameCount: number, event: Event, inputs: XRInput[]) => void;
  }[] = [];

  _onSessionStart(): void {
    const session = (<WebXRSessionManager>this._engine.xrModule.sessionManager)._platformSession;
    if (this._listeningSession !== session) {
      this._listeningSession && this._removeListener(this._listeningSession);
      this._addListener(session);
      this._listeningSession = session;
    }
  }

  _onSessionStop(): void {
    if (this._listeningSession) {
      this._removeListener(this._listeningSession);
      this._listeningSession = null;
    }
  }

  _onDestroy(): void {
    this._onSessionStop();
  }

  _onUpdate() {
    const { _inputs: inputs, _engine: engine, _listeningSession: platformSession } = this;
    const sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
    const { _platformFrame, _platformLayer, _platformSpace } = sessionManager;
    if (!platformSession || !_platformFrame || !_platformSpace) {
      return;
    }
    const { frameCount } = engine.time;
    const { _eventList: eventList } = this;
    for (let i = 0, n = eventList.length; i < n; i++) {
      const event = eventList[i];
      event.handle(frameCount, event.event, inputs);
    }
    eventList.length = 0;
    const { inputSources } = platformSession;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const type = this._getInputSource(inputSource);
      switch (inputSource.targetRayMode) {
        case "gaze":
          break;
        case "screen":
        case "tracked-pointer":
          const input = <XRController>inputs[type];
          // 位姿
          const { gripSpace, gamepad } = inputSource;
          if (gripSpace) {
            const { transform } = _platformFrame.getPose(inputSource.gripSpace, _platformSpace);
            if (transform) {
              input.matrix.copyFromArray(transform.matrix);
              input.position.copyFrom(transform.position);
              input.quaternion.copyFrom(transform.orientation);
            }
          }
          // 摇杆
          if (gamepad) {
            const [, , x, y] = gamepad.axes;
            input.stick.set(x || 0, y || 0);
          }

          input.connected = true;
          break;
        default:
          break;
      }
    }

    const viewerPose = _platformFrame.getViewerPose(_platformSpace);
    if (viewerPose) {
      const views = viewerPose.views;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const { transform } = views[i];
        const xrCamera = inputs[this._eyeToInputSource(view.eye)] as XRViewer;
        xrCamera.matrix.copyFromArray(transform.matrix);
        xrCamera.position.copyFrom(transform.position);
        xrCamera.quaternion.copyFrom(transform.orientation);
        xrCamera.projectionMatrix.copyFromArray(view.projectionMatrix);
        if (_platformLayer) {
          const { framebufferWidth, framebufferHeight } = _platformLayer;
          const xrViewport = _platformLayer.getViewport(view);
          const width = xrViewport.width / framebufferWidth;
          const height = xrViewport.height / framebufferHeight;
          const x = xrViewport.x / framebufferWidth;
          const y = 1 - xrViewport.y / framebufferHeight - height;
          xrCamera.viewport.set(x, y, width, height);
          const { camera } = xrCamera;
          if (camera) {
            // sync viewport
            const vec4 = camera.viewport;
            if (!(x === vec4.x && y === vec4.y && width === vec4.z && height === vec4.w)) {
              camera.viewport = vec4.set(x, y, width, height);
            }
            // sync project matrix
            if (!Matrix.equals(camera.projectionMatrix, xrCamera.projectionMatrix)) {
              camera.projectionMatrix = xrCamera.projectionMatrix;
            }
          }
        }
      }
    }
  }

  private _onSessionEvent(event: XRInputSourceEvent) {
    this._eventList.push({ event, handle: this._handleButtonEvent });
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    this._eventList.push({ event, handle: this._handleInputSourceEvent });
  }

  private _handleButtonEvent(frameCount: number, event: XRInputSourceEvent, inputs: XRInput[]): void {
    const { inputSource } = event;
    const input = inputs[this._getInputSource(inputSource)] as XRController;
    switch (inputSource.targetRayMode) {
      case "tracked-pointer":
        switch (event.type) {
          case "selectstart":
            input.downList.add(EnumXRButton.Select);
            input.downMap[EnumXRButton.Select] = frameCount;
            input.pressedButtons |= EnumXRButton.Select;
            break;
          case "selectend":
            input.upList.add(EnumXRButton.Select);
            input.upMap[EnumXRButton.Select] = frameCount;
            input.pressedButtons &= ~EnumXRButton.Select;
            break;
          case "squeezestart":
            input.downList.add(EnumXRButton.Squeeze);
            input.downMap[EnumXRButton.Squeeze] = frameCount;
            input.pressedButtons |= EnumXRButton.Squeeze;
            break;
          case "squeezeend":
            input.upList.add(EnumXRButton.Squeeze);
            input.upMap[EnumXRButton.Squeeze] = frameCount;
            input.pressedButtons &= ~EnumXRButton.Squeeze;
            break;
          default:
            break;
        }
        break;
      case "screen":
        const { _pointerList: pointerList, _canvas: canvas } = this;
        const { gamepad } = inputSource;
        const { clientWidth, clientHeight } = canvas;
        const [screenX, screenY] = gamepad.axes;
        const clientX = clientWidth * (screenX + 1) * 0.5;
        const clientY = clientHeight * (screenY + 1) * 0.5;
        let idx: number = -1;
        switch (event.type) {
          case "selectstart":
            let emptyIdx = -1;
            for (let i = pointerList.length - 1; i >= 0; i--) {
              const pointer = pointerList[i];
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
                idx = pointerList.push(inputSource) - 1;
              } else {
                pointerList[emptyIdx] = inputSource;
              }
            }
            canvas.dispatchEvent(this.makeUpPointerEvent("pointerdown", idx, clientX, clientY));
            break;
          case "selectend":
            for (let i = pointerList.length - 1; i >= 0; i--) {
              if (pointerList[i] === inputSource) {
                pointerList[i] = null;
                idx = i;
              }
            }
            canvas.dispatchEvent(this.makeUpPointerEvent("pointerup", idx, clientX, clientY));
            canvas.dispatchEvent(this.makeUpPointerEvent("pointerleave", idx, clientX, clientY));
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }

  private makeUpPointerEvent(type: string, pointerId: number, clientX: number, clientY: number): PointerEvent {
    const eventInitDict: PointerEventInit = {
      pointerId,
      clientX,
      clientY
    };
    switch (type) {
      case "pointerdown":
        eventInitDict.button = 0;
        eventInitDict.buttons = 1;
        break;
      case "pointerup":
        eventInitDict.button = 0;
        eventInitDict.buttons = 0;
        break;
      case "pointerleave":
        eventInitDict.button = -1;
        eventInitDict.buttons = 0;
        break;
      default:
        break;
    }
    return new PointerEvent(type, eventInitDict);
  }

  private _handleInputSourceEvent(frameCount: number, event: XRInputSourceChangeEvent, inputs: XRInput[]): void {
    const { removed, added } = event;
    for (let i = 0, n = added.length; i < n; i++) {
      inputs[this._getInputSource(added[i])].connected = true;
    }

    for (let i = 0, n = removed.length; i < n; i++) {
      inputs[this._getInputSource(removed[i])].connected = false;
    }
  }

  private _getInputSource(inputSource: XRInputSource): EnumXRInputSource {
    let type: EnumXRInputSource;
    switch (inputSource.targetRayMode) {
      case "gaze":
        break;
      case "screen":
        return EnumXRInputSource.Controller;
      case "tracked-pointer":
        if (inputSource.hand) {
          switch (inputSource.handedness) {
            case "left":
              return EnumXRInputSource.LeftHand;
            case "right":
              return EnumXRInputSource.RightHand;
          }
        } else {
          switch (inputSource.handedness) {
            case "left":
              return EnumXRInputSource.LeftController;
            case "right":
              return EnumXRInputSource.RightController;
          }
        }
        break;
      default:
        break;
    }
    return type;
  }

  private _eyeToInputSource(eye: XREye): EnumXRInputSource {
    switch (eye) {
      case "left":
        return EnumXRInputSource.LeftViewer;
      case "right":
        return EnumXRInputSource.RightViewer;
      default:
        return EnumXRInputSource.Viewer;
    }
  }

  private _addListener(session: XRSession): void {
    const { _onSessionEvent: onSessionEvent } = this;
    session.addEventListener("select", onSessionEvent);
    session.addEventListener("selectstart", onSessionEvent);
    session.addEventListener("selectend", onSessionEvent);
    session.addEventListener("squeeze", onSessionEvent);
    session.addEventListener("squeezestart", onSessionEvent);
    session.addEventListener("squeezeend", onSessionEvent);
    session.addEventListener("inputsourceschange", this._onInputSourcesChange);
  }

  private _removeListener(session: XRSession): void {
    const { _onSessionEvent: onSessionEvent } = this;
    session.removeEventListener("select", onSessionEvent);
    session.removeEventListener("selectstart", onSessionEvent);
    session.removeEventListener("selectend", onSessionEvent);
    session.removeEventListener("squeeze", onSessionEvent);
    session.removeEventListener("squeezestart", onSessionEvent);
    session.removeEventListener("squeezeend", onSessionEvent);
    session.removeEventListener("inputsourceschange", this._onInputSourcesChange);
    this._eventList.length = 0;
  }

  constructor(engine: Engine) {
    super(engine);
    // @ts-ignore
    this._canvas = this._engine._canvas._webCanvas;
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._handleButtonEvent = this._handleButtonEvent.bind(this);
    this._handleInputSourceEvent = this._handleInputSourceEvent.bind(this);
  }
}
