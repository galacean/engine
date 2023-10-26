import { IXRFeatureDescriptor, IXRSessionManager } from "@galacean/engine-design";
import { SessionStateChangeFlags } from "../enum/SessionStateChangeFlags";
import { EnumXRMode } from "../enum/EnumXRMode";
import { Utils } from "../../Utils";
import { SessionState } from "http2";

type StateChangeListenerConstructor = (type?: number, param?: Object) => void;

export abstract class XRSessionManager implements IXRSessionManager {
  protected _listeners: StateChangeListenerConstructor[] = [];
  protected _in: SessionState;

  /**
   * Return a list of supported frame rates (only available in-session!
   */
  get supportedFrameRate(): number[] {
    return [];
  }

  /**
   * Return the current frame rate as reported by the device
   */
  get currentFrameRate(): number {
    return 0;
  }

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
