import {
  Engine,
  XRController,
  XRInput,
  EnumXRButton,
  XRInputManager,
  XRInputTrackingState,
  Time
} from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { getInputSource } from "../util";

export class WebXRInputManager extends XRInputManager {
  private _session: XRSession;
  private _screenInputSource: XRInputSource[] = [];
  private _canvas: HTMLCanvasElement;
  private _time: Time;
  private _eventList: {
    event: Event;
    handle: (event: Event, inputs: XRInput[]) => void;
  }[] = [];

  _onSessionStart(): void {
    const nowSession = (<WebXRSessionManager>this._engine.xrModule.sessionManager)._platformSession;
    const preSession = this._session;
    if (preSession !== nowSession) {
      preSession && this._removeListener(preSession);
      this._addListener(nowSession);
      this._session = nowSession;
    }
  }

  _onSessionStop(): void {
    if (this._session) {
      this._removeListener(this._session);
      this._session = null;
    }
  }

  _onDestroy(): void {
    if (this._session) {
      this._removeListener(this._session);
      this._session = null;
    }
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const { _inputs: inputs, _engine: engine } = this;
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
    const { _eventList: eventList } = this;
    for (let i = 0, n = eventList.length; i < n; i++) {
      const event = eventList[i];
      event.handle(event.event, inputs);
    }
    eventList.length = 0;
  }

  private _onSessionEvent(event: XRInputSourceEvent) {
    this._eventList.push({ event, handle: this._handleButtonEvent });
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    this._eventList.push({ event, handle: this._handleInputSourceEvent });
  }

  private _handleButtonEvent(event: XRInputSourceEvent, inputs: XRInput[]): void {
    const { inputSource } = event;
    const input = inputs[getInputSource(inputSource)] as XRController;
    switch (inputSource.targetRayMode) {
      case "tracked-pointer":
        switch (event.type) {
          case "selectstart":
            input.downList.add(EnumXRButton.Select);
            input.downMap[EnumXRButton.Select] = this._time.frameCount;
            input.pressedButtons |= EnumXRButton.Select;
            break;
          case "selectend":
            input.upList.add(EnumXRButton.Select);
            input.upMap[EnumXRButton.Select] = this._time.frameCount;
            input.pressedButtons &= ~EnumXRButton.Select;
            break;
          case "squeezestart":
            input.downList.add(EnumXRButton.Squeeze);
            input.downMap[EnumXRButton.Squeeze] = this._time.frameCount;
            input.pressedButtons |= EnumXRButton.Squeeze;
            break;
          case "squeezeend":
            input.upList.add(EnumXRButton.Squeeze);
            input.upMap[EnumXRButton.Squeeze] = this._time.frameCount;
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

  private _handleInputSourceEvent(event: XRInputSourceChangeEvent, inputs: XRInput[]): void {
    const { removed } = event;
    for (let i = 0, n = removed.length; i < n; i++) {
      inputs[getInputSource(removed[i])].trackingState = XRInputTrackingState.NotTracking;
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
    this._canvas = engine._canvas._webCanvas;
    this._time = engine.time;
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._handleButtonEvent = this._handleButtonEvent.bind(this);
    this._handleInputSourceEvent = this._handleInputSourceEvent.bind(this);
  }
}
