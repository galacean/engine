import { EnumXRHandedness } from "./enum/EnumXRHandedness";

export class XRInputManager {
  private _session: XRSession;
  private _events = [];
  private _inputs = [];

  update() {
    // 处理每个 input 的逻辑
    const { _inputs: inputs } = this;
    for (let i = 0, n = inputs.length; i < n; i++) {
      const input = inputs[i];
      if (!!!input) {
        continue;
      }
    }

    // 处理 inputSource 改变的逻辑
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

  private _onSessionEvent(event: XRInputSourceEvent) {
    this._events.push(event);
  }

  private _onInputSourcesChange(event: XRInputSourceChangeEvent) {
    const { _session: session, _inputs: inputs } = this;
    if (!session) {
      inputs.length = 0;
      return;
    }
    const { inputSources } = session;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      inputs[EnumXRHandedness[inputSource.handedness]] = inputSource;
    }
    const { removed, added } = event;
    for (let i = 0, n = removed.length; i < n; i++) {
      inputs[EnumXRHandedness[event.removed[i].handedness]] = null;
    }

    for (let i = 0, n = added.length; i < n; i++) {
      const inputSource = event.added[i];
      inputs[EnumXRHandedness[inputSource.handedness]] = inputSource;
    }
  }
}
