import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { EnumXRButtonBin, EnumXRButtonDec } from "./enum/EnumXRButton";
import { EnumXRHandedness } from "./enum/EnumXRHandedness";
import { XRHandle } from "./XRHandle";

export class XRInputManager {
  private _engine: Engine;
  private _session: XRSession;
  private _events: XRInputSourceEvent[] = [];
  private _inputs: XRInputSource[] = [];
  private _xrHandles: XRHandle[] = [];

  getXRHandle(handedness: EnumXRHandedness): XRHandle {
    return this._xrHandles[handedness];
  }

  /**
   * 更新手柄
   * @param frame
   * @param space
   */
  updateHandedness(frame: XRFrame, space: XRReferenceSpace) {
    // 处理每个 input 的逻辑
    const { _inputs: inputs, _xrHandles: xrHandles } = this;
    inputs.forEach((input) => {
      if (!!input) {
        const oriMatrix = frame.getPose(input.gripSpace, space)?.transform.matrix;
        if (oriMatrix) {
          let handle: XRHandle;
          if (xrHandles[EnumXRHandedness[input.handedness]]) {
            handle = xrHandles[EnumXRHandedness[input.handedness]];
            handle.matrix.copyFromArray(oriMatrix);
            handle.linearVelocity
              .set(
                oriMatrix[12] - handle.position.x,
                oriMatrix[13] - handle.position.y,
                oriMatrix[14] - handle.position.z
              )
              .scale(1 / this._engine.time.deltaTime);
          } else {
            handle = (xrHandles[EnumXRHandedness[input.handedness]] = new XRHandle());
            handle.matrix.copyFromArray(oriMatrix);
          }
          handle.position.set(oriMatrix[12], oriMatrix[13], oriMatrix[14]);
        }
      }
    });
  }

  updateSessionEvent() {
    const { _events: events, _xrHandles: xrHandles } = this;
    const frameCount = this._engine.time.frameCount + 1;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const handedness = EnumXRHandedness[event.inputSource.handedness];
      xrHandles[handedness]._events.push(event);
    }

    xrHandles.forEach((xrHandle) => {
      if (!xrHandle) {
        return;
      }
      const handleEvents = xrHandle._events;
      for (let j = 0; j < handleEvents.length; j++) {
        const handleEvent = handleEvents[j];
        switch (handleEvent.type) {
          case "selectstart":
            xrHandle._downList.add(EnumXRButtonDec.Select);
            xrHandle._downMap[EnumXRButtonDec.Select] = frameCount;
            xrHandle.pressedButtons |= EnumXRButtonBin.Select;
            break;
          case "selectend":
            xrHandle._upList.add(EnumXRButtonDec.Select);
            xrHandle._upMap[EnumXRButtonDec.Select] = frameCount;
            xrHandle.pressedButtons &= ~EnumXRButtonBin.Select;
            break;
          case "squeezestart":
            xrHandle._downList.add(EnumXRButtonDec.Squeeze);
            xrHandle._downMap[EnumXRButtonDec.Squeeze] = frameCount;
            xrHandle.pressedButtons |= EnumXRButtonBin.Squeeze;
            break;
          case "squeezeend":
            xrHandle._upList.add(EnumXRButtonDec.Squeeze);
            xrHandle._upMap[EnumXRButtonDec.Squeeze] = frameCount;
            xrHandle.pressedButtons &= ~EnumXRButtonBin.Squeeze;
            break;
          default:
            break;
        }
      }
      handleEvents.length = 0;
      events.length = 0;
    });
  }

  isButtonDown(handedness: EnumXRHandedness, button: EnumXRButtonDec): boolean {
    return !!(this._xrHandles[handedness]?._downMap[button] === this._engine.time.frameCount);
  }

  isButtonUp(handedness: EnumXRHandedness, button: EnumXRButtonDec): boolean {
    return !!(this._xrHandles[handedness]?._upMap[button] === this._engine.time.frameCount);
  }

  isButtonHeldDown(handedness: EnumXRHandedness, button: EnumXRButtonBin): boolean {
    return !!(this._xrHandles[handedness]?.pressedButtons & button);
  }

  init(session: XRSession) {
    this._session = session;
    const onSessionEvent = (this._onSessionEvent = this._onSessionEvent.bind(this));
    session.addEventListener("select", onSessionEvent);
    session.addEventListener("selectstart", onSessionEvent);
    session.addEventListener("selectend", onSessionEvent);
    session.addEventListener("squeeze", onSessionEvent);
    session.addEventListener("squeezestart", onSessionEvent);
    session.addEventListener("squeezeend", onSessionEvent);

    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    session.addEventListener("inputsourceschange", this._onInputSourcesChange);
  }

  constructor(engine: Engine) {
    this._engine = engine;
  }

  private _onSessionEvent(event: XRInputSourceEvent) {
    this._events.push(event);
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    const { _session: session, _inputs: inputs, _xrHandles: xrPoses } = this;
    if (!session) {
      inputs.length = 0;
      xrPoses.length = 0;
      return;
    }
    const { inputSources } = session;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      inputs[EnumXRHandedness[inputSource.handedness]] = inputSource;
    }
    const { removed, added } = event;
    for (let i = 0, n = removed.length; i < n; i++) {
      const handedness = EnumXRHandedness[event.removed[i].handedness];
      inputs[handedness] = null;
      xrPoses[handedness] = null;
      console.log("手柄" + handedness + "断开连接");
    }
    for (let i = 0, n = added.length; i < n; i++) {
      const inputSource = event.added[i];
      inputs[EnumXRHandedness[inputSource.handedness]] = inputSource;
      console.log("手柄" + inputSource.handedness + "加入连接");
    }
  }
}
