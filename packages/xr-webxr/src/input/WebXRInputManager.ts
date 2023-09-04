import {
  Engine,
  XRController,
  XRViewer,
  XRInput,
  EnumXRInputSource,
  EnumXRButton,
  XRInputManager
} from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";

export class WebXRInputManager extends XRInputManager {
  private _listeningSession: XRSession;
  private _gamePadStore: XRInputSource[] = [];
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
    if (!platformSession || !_platformFrame) {
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
          if (xrCamera.camera) {
            const vec4 = xrCamera.camera.viewport;
            vec4.set(x, y, width, height);
            xrCamera.camera.viewport = vec4;
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
        const { gamepad } = inputSource;
        if (!gamepad) {
          return;
        }
        // @ts-ignore
        // const canvas = this._engine._canvas._webCanvas;
        const [screenX, screenY, stickX, stickY] = gamepad.axes;
        console.log("screen position", screenX, screenY);
        console.log("stick position", stickX, stickY);
        switch (event.type) {
          case "selectstart":
            input.pressedButtons |= EnumXRButton.Select;
            break;
          case "select":
            // move ?
            break;
          case "selectend":
            const { pointers } = input;
            let pressedButtons = 0;
            for (let i = 0, n = pointers.length; i < n; i++) {
              pressedButtons |= pointers[i].buttons;
            }
            input.pressedButtons = pressedButtons;
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }

  // private makeUpPointerEvent(type: string, position: any): PointerEvent {
  //   const outPos = new Vec3();
  //   this._camera?.worldToScreen(worldPosition, outPos);

  //   const touchInitDict: TouchInit = {
  //     identifier: 0,
  //     target: this._gl?.canvas as EventTarget,
  //     clientX: outPos.x,
  //     clientY: outPos.y,
  //     pageX: outPos.x,
  //     pageY: outPos.y,
  //     screenX: outPos.x,
  //     screenY: outPos.y,
  //     force: 1,
  //     radiusX: 1,
  //     radiusY: 1
  //   };

  //   const touch = new Touch(touchInitDict);
  //   const touches: Touch[] = [touch];
  //   const eventInitDict: PointerEventInit = {
  //     touches,
  //     targetTouches: touches,
  //     changedTouches: touches
  //   };
  //   return new PointerEvent(type, eventInitDict);
  // }

  private _removeInputFromStore(inputSource: XRInputSource): void {
    const { _gamePadStore: gamePadStore } = this;
    const idx = gamePadStore.indexOf(inputSource);
    if (idx >= 0) {
      gamePadStore.splice(idx, 1);
    }
  }

  private _addInputToStore(inputSource: XRInputSource): void {
    const { _gamePadStore: gamePadStore } = this;
    const idx = gamePadStore.indexOf(inputSource);
    if (idx < 0) {
      gamePadStore.push(inputSource);
    }
  }

  private _handleInputSourceEvent(frameCount: number, event: XRInputSourceChangeEvent, inputs: XRInput[]): void {
    const { removed, added } = event;
    for (let i = 0, n = added.length; i < n; i++) {
      const inputSource = added[i];
      const type = this._getInputSource(inputSource);
      type === EnumXRInputSource.Controller && this._addInputToStore(inputSource);
      inputs[type].connected = true;
    }

    for (let i = 0, n = removed.length; i < n; i++) {
      const inputSource = removed[i];
      const type = this._getInputSource(inputSource);
      type === EnumXRInputSource.Controller && this._removeInputFromStore(inputSource);
      inputs[type].connected = false;
    }
  }

  private _getInputSource(inputSource: XRInputSource): EnumXRInputSource {
    let type: EnumXRInputSource;
    switch (inputSource.targetRayMode) {
      case "gaze":
        // 眼睛
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
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._handleButtonEvent = this._handleButtonEvent.bind(this);
    this._handleInputSourceEvent = this._handleInputSourceEvent.bind(this);
  }
}
