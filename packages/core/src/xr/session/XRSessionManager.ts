import { IXRFeatureDescriptor, IXRSessionManager } from "@galacean/engine-design";
import { SessionStateChangeFlags } from "../enum/SessionStateChangeFlags";
import { EnumXRMode } from "../enum/EnumXRMode";
import { Utils } from "../../Utils";

type StateChangeListenerConstructor = (type?: number, param?: Object) => void;

export abstract class XRSessionManager implements IXRSessionManager {
  protected _listeners: StateChangeListenerConstructor[] = [];

  initialize(mode: EnumXRMode, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  addStateChangeListener(listener: StateChangeListenerConstructor): void {
    this._listeners.push(listener);
  }

  removeStateChangeListener(listener: StateChangeListenerConstructor): void {
    Utils.removeFromArray(this._listeners, listener);
  }

  protected _dispatchStateChange(state: SessionStateChangeFlags): void {
    const listeners = this._listeners;
    for (let i = listeners.length - 1; i >= 0; i--) {
      listeners[i](state);
    }
  }
}
