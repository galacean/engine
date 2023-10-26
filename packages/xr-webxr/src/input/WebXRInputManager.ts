import {
  Engine,
  XRController,
  XRViewer,
  XRInput,
  EnumXRInputSource,
  EnumXRButton,
  XRInputManager,
  Matrix,
  EnumXRMode,
  Vector3
} from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { getInputSource } from "../util";

export class WebXRInputManager extends XRInputManager {
  private _platformSession: XRSession;
  private _screenInputSource: XRInputSource[] = [];
  private _canvas: HTMLCanvasElement;
  private _eventList: {
    event: Event;
    handle: (frameCount: number, event: Event, inputs: XRInput[]) => void;
  }[] = [];

  _onSessionStart(): void {
    const session = (<WebXRSessionManager>this._engine.xrModule.sessionManager)._platformSession;
    if (this._platformSession !== session) {
      this._platformSession && this._removeListener(this._platformSession);
      this._addListener(session);
      this._platformSession = session;
    }
  }

  _onSessionStop(): void {
    if (this._platformSession) {
      this._removeListener(this._platformSession);
      this._platformSession = null;
    }
  }

  _onDestroy(): void {
    this._onSessionStop();
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const { _inputs: inputs, _engine: engine, _platformSession: platformSession } = this;
    const sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
    const { _platformFrame, _platformLayer, _platformSpace } = sessionManager;
    if (!platformSession || !_platformFrame || !_platformSpace) {
      return;
    }

    // Select event does not dispatch the move event, so we need to simulate dispatching the move here.
    const { _screenInputSource: screenInputSource, _canvas: canvas } = this;
    for (let i = 0; i < screenInputSource.length; i++) {
      const inputSource = screenInputSource[i];
      if (!inputSource) continue;
      const { gamepad } = inputSource;
      const { clientWidth, clientHeight } = canvas;
      const [screenX, screenY] = gamepad.axes;
      const clientX = clientWidth * (screenX + 1) * 0.5;
      const clientY = clientHeight * (screenY + 1) * 0.5;
      canvas.dispatchEvent(this.makeUpPointerEvent("pointermove", i, clientX, clientY));
    }

    // Handle pressure flow events.
    const { frameCount } = engine.time;
    const { _eventList: eventList } = this;
    for (let i = 0, n = eventList.length; i < n; i++) {
      const event = eventList[i];
      event.handle(frameCount, event.event, inputs);
    }
    eventList.length = 0;
  }

  private _onSessionEvent(event: XRInputSourceEvent) {
    this._eventList.push({ event, handle: this._handleButtonEvent });
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    this._eventList.push({ event, handle: this._handleInputSourceEvent });
  }

  private _handleButtonEvent(frameCount: number, event: XRInputSourceEvent, inputs: XRInput[]): void {
    const { inputSource } = event;
    const input = inputs[getInputSource(inputSource)] as XRController;
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
        const { _screenInputSource: screenInputSource, _canvas: canvas } = this;
        const { gamepad } = inputSource;
        const { clientWidth, clientHeight } = canvas;
        const [screenX, screenY] = gamepad.axes;
        const clientX = clientWidth * (screenX + 1) * 0.5;
        const clientY = clientHeight * (screenY + 1) * 0.5;
        let idx: number = -1;
        switch (event.type) {
          case "selectstart":
            let emptyIdx = -1;
            for (let i = screenInputSource.length - 1; i >= 0; i--) {
              const pointer = screenInputSource[i];
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
                idx = screenInputSource.push(inputSource) - 1;
              } else {
                idx = emptyIdx;
                screenInputSource[emptyIdx] = inputSource;
              }
            }
            canvas.dispatchEvent(this.makeUpPointerEvent("pointerdown", idx, clientX, clientY));
            break;
          case "selectend":
            for (let i = screenInputSource.length - 1; i >= 0; i--) {
              if (screenInputSource[i] === inputSource) {
                screenInputSource[i] = null;
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
      inputs[getInputSource(added[i])].connected = true;
    }

    for (let i = 0, n = removed.length; i < n; i++) {
      inputs[getInputSource(removed[i])].connected = false;
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
