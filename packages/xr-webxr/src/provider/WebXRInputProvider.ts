import { Engine, XRController, XRViewer, XRInputDevice, EnumXRInputSource, EnumXRButton } from "@galacean/engine";
import { IXRInputProvider } from "@galacean/engine-design";
import { WebXRSession } from "../WebXRSession";

export class WebXRInputProvider implements IXRInputProvider {
  private _engine: Engine;
  private _session: WebXRSession;
  private _inputs: XRInputDevice[];
  private _eventList: {
    event: Event;
    handle: (frameCount: number, event: Event, inputs: XRInputDevice[]) => void;
  }[] = [];

  attach(session: WebXRSession, inputs: XRInputDevice[]): void {
    if (this._session !== session) {
      this._session = session;
      const { _platformSession: platformSession } = session;
      const { _onSessionEvent: onSessionEvent } = this;
      platformSession.addEventListener("select", onSessionEvent);
      platformSession.addEventListener("selectstart", onSessionEvent);
      platformSession.addEventListener("selectend", onSessionEvent);
      platformSession.addEventListener("squeeze", onSessionEvent);
      platformSession.addEventListener("squeezestart", onSessionEvent);
      platformSession.addEventListener("squeezeend", onSessionEvent);
      platformSession.addEventListener("inputsourceschange", this._onInputSourcesChange);
    }
    if (this._inputs !== inputs) this._inputs = inputs;
  }

  detach(): void {
    if (!this._session) {
      return;
    }
    const { _platformSession: platformSession } = this._session;
    const { _onSessionEvent: onSessionEvent } = this;
    platformSession.removeEventListener("select", onSessionEvent);
    platformSession.removeEventListener("selectstart", onSessionEvent);
    platformSession.removeEventListener("selectend", onSessionEvent);
    platformSession.removeEventListener("squeeze", onSessionEvent);
    platformSession.removeEventListener("squeezestart", onSessionEvent);
    platformSession.removeEventListener("squeezeend", onSessionEvent);
    platformSession.removeEventListener("inputsourceschange", this._onInputSourcesChange);
    this._session = null;
    this._inputs = null;
    this._eventList.length = 0;
  }

  destroy(): void {
    this.detach();
  }

  onXRFrame() {
    const { _session: session } = this;
    if (!session) {
      return;
    }

    const { _inputs: inputs } = this;
    const { _platformSession, _platformFrame, _platformLayer, _platformSpace } = session;
    if (!_platformSession || !_platformFrame) {
      return;
    }
    const { frameCount } = this._engine.time;
    const { _eventList: eventList } = this;
    for (let i = 0, n = eventList.length; i < n; i++) {
      const event = eventList[i];
      event.handle(frameCount, event.event, inputs);
    }
    eventList.length = 0;

    const { inputSources } = _platformSession;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const type = this._getInputSource(inputSource);
      const controller = inputs[type];
      switch (type) {
        case EnumXRInputSource.LeftController:
        case EnumXRInputSource.RightController:
          const { transform } = _platformFrame.getPose(inputSource.gripSpace, _platformSpace);
          if (transform) {
            controller.matrix.copyFromArray(transform.matrix);
            controller.position.copyFrom(transform.position);
            controller.quaternion.copyFrom(transform.orientation);
          }
          break;
        case EnumXRInputSource.Gamepad:
          break;
        default:
          break;
      }
      controller.connected = true;
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

  private _handleButtonEvent(frameCount: number, event: XRInputSourceEvent, inputs: XRInputDevice[]): void {
    const input = inputs[this._getInputSource(event.inputSource)] as XRController;
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
  }

  private _handleInputSourceEvent(frameCount: number, event: XRInputSourceChangeEvent, inputs: XRInputDevice[]): void {
    const { removed, added } = event;
    for (let i = 0, n = removed.length; i < n; i++) {
      inputs[this._getInputSource(removed[i])].connected = false;
    }
    for (let i = 0, n = added.length; i < n; i++) {
      inputs[this._getInputSource(added[i])].connected = true;
    }
  }

  private _getInputSource(inputSource: XRInputSource): EnumXRInputSource {
    let type: EnumXRInputSource;
    if (inputSource.gamepad) {
      type = EnumXRInputSource.Gamepad;
    } else if (inputSource.hand) {
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

  constructor(engine: Engine) {
    this._engine = engine;
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._handleButtonEvent = this._handleButtonEvent.bind(this);
    this._handleInputSourceEvent = this._handleInputSourceEvent.bind(this);
  }
}
