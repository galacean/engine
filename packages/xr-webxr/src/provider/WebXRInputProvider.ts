import {
  Engine,
  EnumXRButton,
  EnumXRInputState,
  EnumXRInputSource,
  XRController,
  XRViewer,
  IXRInputProvider,
  XRInputDevice
} from "@galacean/engine";
import { WebXRSession } from "../WebXRSession";

type FlowXREvent = XRInputSourceEvent | XRInputSourceChangeEvent;

export class WebXRInputProvider implements IXRInputProvider {
  private _engine: Engine;
  private _session: WebXRSession;
  private _inputs: XRInputDevice[];
  private _flowEventList: {
    event: FlowXREvent;
    handle: (frameCount: number, event: FlowXREvent, inputs: XRInputDevice[]) => void;
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
    this._flowEventList.length = 0;
  }

  destroy(): void {
    this.detach();
  }

  update() {
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
    const { _flowEventList: flowEventList } = this;
    for (let i = 0, n = flowEventList.length; i < n; i++) {
      const flowEvent = flowEventList[i];
      flowEvent.handle(frameCount, flowEvent.event, inputs);
    }
    flowEventList.length = 0;

    const { inputSources } = _platformSession;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const controller = inputs[this._handednessToInputSource(inputSource.handedness)];
      const { transform } = _platformFrame.getPose(inputSource.gripSpace, _platformSpace);
      if (transform) {
        controller.matrix.copyFromArray(transform.matrix);
        controller.position.copyFrom(transform.position);
        controller.quaternion.copyFrom(transform.orientation);
      }
      controller.state = EnumXRInputState.Active;
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
    this._flowEventList.push({ event, handle: this._handleButtonEvent });
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    this._flowEventList.push({ event, handle: this._handleInputSourceEvent });
  }

  private _handleButtonEvent(frameCount: number, event: XRInputSourceEvent, inputs: XRInputDevice[]): void {
    const input = inputs[this._handednessToInputSource(event.inputSource.handedness)] as XRController;
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
      inputs[this._handednessToInputSource(removed[i].handedness)].state = EnumXRInputState.Inactive;
    }
    for (let i = 0, n = added.length; i < n; i++) {
      inputs[this._handednessToInputSource(added[i].handedness)].state = EnumXRInputState.Active;
    }
  }

  private _handednessToInputSource(handedness: XRHandedness): EnumXRInputSource {
    switch (handedness) {
      case "left":
        return EnumXRInputSource.LeftController;
      case "right":
        return EnumXRInputSource.RightController;
      default:
        return EnumXRInputSource.Controller;
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

  constructor(engine: Engine) {
    this._engine = engine;
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._handleButtonEvent = this._handleButtonEvent.bind(this);
    this._handleInputSourceEvent = this._handleInputSourceEvent.bind(this);
  }
}
