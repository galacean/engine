import {
  Engine,
  EnumXRButton,
  EnumXRDevicePhase,
  EnumXRFeature,
  EnumXRInputSource,
  IXRDevice,
  IXRInputManager
} from "@galacean/engine";
import { WebXRProvider, registerXRFeature } from "../WebXRProvider";
import { EnumWebXREvent } from "../enum/EnumWebXREvent";
import { WebXRHandle } from "../data/WebXRHandle";
import { WebXRCamera } from "../data/WebXRCamera";

@registerXRFeature(EnumXRFeature.input)
export class WebXRInputManager implements IXRInputManager {
  static isSupported(engine: Engine, provider: WebXRProvider): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(true);
    });
  }

  static create(engine: Engine, provider: WebXRProvider): Promise<WebXRInputManager> {
    return new Promise((resolve, reject) => {
      resolve(new WebXRInputManager(engine, provider));
    });
  }

  private _engine: Engine;
  private _provider: WebXRProvider;
  private _devices: IXRDevice[] = [];

  onEnable(): boolean {
    this._addListener();
    return true;
  }

  onDisable(): boolean {
    this._removeListener();
    return true;
  }

  onDestroy(): void {
    this._removeListener();
    this._devices.length = 0;
  }

  getDevice<T extends IXRDevice>(source: EnumXRInputSource): T {
    return this._devices[source] as T;
  }

  onUpdate(): void {
    const { _frame: frame, _space: space, _layer: layer } = this._provider;
    if (!frame) {
      return;
    }
    const { frameCount } = this._engine.time;
    // Update event
    const { _devices: devices } = this;
    devices.forEach((device: IXRDevice) => {
      if (device instanceof WebXRHandle) {
        const { _events: events } = device;
        for (let j = 0; j < events.length; j++) {
          const handleEvent = events[j];
          switch (handleEvent.type) {
            case "selectstart":
              device._downList.add(EnumXRButton.Select);
              device._downMap[EnumXRButton.Select] = frameCount;
              device.pressedButtons |= EnumXRButton.Select;
              break;
            case "selectend":
              device._upList.add(EnumXRButton.Select);
              device._upMap[EnumXRButton.Select] = frameCount;
              device.pressedButtons &= ~EnumXRButton.Select;
              break;
            case "squeezestart":
              device._downList.add(EnumXRButton.Squeeze);
              device._downMap[EnumXRButton.Squeeze] = frameCount;
              device.pressedButtons |= EnumXRButton.Squeeze;
              break;
            case "squeezeend":
              device._upList.add(EnumXRButton.Squeeze);
              device._upMap[EnumXRButton.Squeeze] = frameCount;
              device.pressedButtons &= ~EnumXRButton.Squeeze;
              break;
            default:
              break;
          }
        }
        device._events.length = 0;
      }
    });

    // update handle
    devices.forEach((xrHandle: IXRDevice) => {
      if (xrHandle instanceof WebXRHandle) {
        const { transform } = frame.getPose(xrHandle._inputSource.gripSpace, space);
        if (transform) {
          xrHandle.matrix.copyFromArray(transform.matrix);
          xrHandle.position.copyFrom(transform.position);
          xrHandle.quaternion.copyFrom(transform.orientation);
        }
      }
    });

    // update camera
    const viewerPose = frame.getViewerPose(space);
    if (viewerPose) {
      const views = viewerPose.views;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const { transform } = views[i];
        const deviceSource = this._getCameraSource(view.eye);
        const xrCamera = ((devices[deviceSource] as WebXRCamera) ||= new WebXRCamera());
        xrCamera.matrix.copyFromArray(transform.matrix);
        xrCamera.position.copyFrom(transform.position);
        xrCamera.quaternion.copyFrom(transform.orientation);
        xrCamera.project.copyFromArray(view.projectionMatrix);
        if (layer) {
          const { framebufferWidth, framebufferHeight } = layer;
          xrCamera.frameWidth = framebufferWidth;
          xrCamera.frameHeight = framebufferHeight;
          const xrViewport = layer.getViewport(view);
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
    const { _devices: devices } = this;
    const handedness = this._getHandleSource(event.inputSource.handedness);
    if (handedness) {
      const handle = ((devices[handedness] as WebXRHandle) ||= new WebXRHandle());
      handle.phase = EnumXRDevicePhase.active;
      handle._events.push(event);
    }
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    const session = this._provider._session;
    if (!session) {
      return;
    }
    const { inputSources } = session;
    const { _devices: devices } = this;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const handedness = this._getHandleSource(inputSource.handedness);
      const handle = ((devices[handedness] as WebXRHandle) ||= new WebXRHandle());
      handle._inputSource = inputSource;
    }
    const { removed, added } = event;
    for (let i = 0, n = removed.length; i < n; i++) {
      const inputSource = removed[i];
      const handedness = this._getHandleSource(inputSource.handedness);
      const handle = ((devices[handedness] as WebXRHandle) ||= new WebXRHandle());
      handle.phase = EnumXRDevicePhase.leave;
      handle._inputSource = null;
    }
    for (let i = 0, n = added.length; i < n; i++) {
      const inputSource = event.added[i];
      const handedness = this._getHandleSource(inputSource.handedness);
      const handle = ((devices[handedness] as WebXRHandle) ||= new WebXRHandle());
      handle.phase = EnumXRDevicePhase.active;
      handle._inputSource = inputSource;
    }
  }

  private _addListener() {
    const { _session: session } = this._provider;
    const { _onSessionEvent, _onInputSourcesChange } = this;
    session.addEventListener(EnumWebXREvent.Select, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.SelectStart, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.SelectEnd, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.Squeeze, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.SqueezeStart, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.SqueezeEnd, _onSessionEvent);
    session.addEventListener(EnumWebXREvent.InputSourcesChange, _onInputSourcesChange);
  }

  private _removeListener() {
    const { _session: session } = this._provider;
    const { _onSessionEvent, _onInputSourcesChange } = this;
    session.removeEventListener(EnumWebXREvent.Select, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.SelectStart, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.SelectEnd, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.Squeeze, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.SqueezeStart, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.SqueezeEnd, _onSessionEvent);
    session.removeEventListener(EnumWebXREvent.InputSourcesChange, _onInputSourcesChange);
  }

  isButtonDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<WebXRHandle>this._devices[handedness])?._downMap[button] === this._engine.time.frameCount);
  }

  isButtonUp(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<WebXRHandle>this._devices[handedness])?._upMap[button] === this._engine.time.frameCount);
  }

  isButtonHeldDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<WebXRHandle>this._devices[handedness])?.pressedButtons & button);
  }

  private _getHandleSource(handedness: XRHandedness): EnumXRInputSource {
    switch (handedness) {
      case "left":
        return EnumXRInputSource.LeftHandle;
      case "right":
        return EnumXRInputSource.RightHandle;
      default:
        return EnumXRInputSource.Handler;
    }
  }

  private _getCameraSource(eye: XREye): EnumXRInputSource {
    switch (eye) {
      case "left":
        return EnumXRInputSource.LeftEye;
      case "right":
        return EnumXRInputSource.RightEye;
      default:
        return EnumXRInputSource.Eye;
    }
  }

  constructor(engine: Engine, provider: WebXRProvider) {
    this._engine = engine;
    this._provider = provider;
    this._onSessionEvent = this._onSessionEvent.bind(this);
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._addListener();
  }
}
