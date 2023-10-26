import { Utils } from "../../Utils";
import { EnumTrackingState } from "../enum/EnumTrackingState";

type StateChangeListenerConstructor = (type?: number, param?: Object) => void;
export abstract class XRDisplayManager {
  protected _listeners: StateChangeListenerConstructor[] = [];

  get fixedFoveation(): number {
    return 0;
  }

  set fixedFoveation(value) {
    value = Math.max(0, Math.min(1, value || 0));
  }

  addTrackingStateChangeListener(listener: StateChangeListenerConstructor): void {
    this._listeners.push(listener);
  }

  removeTrackingStateChangeListener(listener: StateChangeListenerConstructor): void {
    Utils.removeFromArray(this._listeners, listener);
  }

  protected _dispatchStateChange(state: EnumTrackingState): void {
    const listeners = this._listeners;
    for (let i = listeners.length - 1; i >= 0; i--) {
      listeners[i](state);
    }
  }

  /**
   * @internal
   */
  _onSessionStart(): void {}

  /**
   * @internal
   */
  _onUpdate(): void {}

  /**
   * @internal
   */
  _onSessionStop(): void {}

  /**
   * @internal
   */
  _onDestroy(): void {}
}
