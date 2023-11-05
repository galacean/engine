import { IXRFeatureDescriptor, IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { IXRDevice } from "./IXRDevice";
import { XRInputManager } from "./input/XRInputManager";
import { XRFeatureType } from "./feature/XRFeatureType";
import { XRSessionManager } from "./session/XRSessionManager";
import { XRSessionState } from "./session/XRSessionState";
import { XRSessionType } from "./session/XRSessionType";
import { XRFeatureManager } from "./feature/XRFeatureManager";
import { XRPlatformFeature } from "./feature/XRPlatformFeature";
import { Logger } from "../base";
import { Utils } from "../Utils";

type TXRFeatureManager = XRFeatureManager<IXRFeatureDescriptor, IXRPlatformFeature>;
type TXRFeatureManagerConstructor = new (engine: Engine) => TXRFeatureManager;
type TXRSessionStateChangeListener = (from: XRSessionState, to: XRSessionState) => void;

export class XRModule {
  // @internal
  static _featureManagerMap: TXRFeatureManagerConstructor[] = [];

  xrDevice: IXRDevice;
  inputManager: XRInputManager;
  sessionManager: XRSessionManager;

  private _engine: Engine;
  private _features: TXRFeatureManager[] = [];
  private _sessionState: XRSessionState = XRSessionState.NotInitialized;
  private _listeners: TXRSessionStateChangeListener[] = [];

  private _mode: XRSessionType;
  private _requestFeatures: IXRFeatureDescriptor[];

  get mode(): XRSessionType {
    return this._mode;
  }

  get requestFeatures(): IXRFeatureDescriptor[] {
    return this._requestFeatures;
  }

  get sessionState(): XRSessionState {
    return this._sessionState;
  }

  isSupported(mode: XRSessionType): Promise<void> {
    return this.xrDevice.isSupported(mode);
  }

  isSupportedFeature(descriptors: IXRFeatureDescriptor | IXRFeatureDescriptor[]): Promise<void> {
    if (descriptors instanceof Array) {
      const promiseArr = [];
      for (let i = 0, n = descriptors.length; i < n; i++) {
        promiseArr.push(this.isSupportedFeature(descriptors[i]));
      }
      return new Promise((resolve, reject) => {
        Promise.all(promiseArr).then(() => {
          resolve();
        }, reject);
      });
    } else {
      const feature = this.getFeature(descriptors.type);
      if (feature) {
        return feature.isSupported(descriptors);
      } else {
        return Promise.reject(
          "The platform interface layer of the " + XRFeatureType[descriptors.type] + " is not implemented."
        );
      }
    }
  }

  disableAllFeatures(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i] && (features[i].enabled = false);
    }
  }

  getFeature<T extends XRFeatureManager<IXRFeatureDescriptor, XRPlatformFeature>>(type: XRFeatureType): T {
    const { _features: features } = this;
    const feature = features[type];
    if (feature) {
      return <T>feature;
    } else {
      const { _featureManagerMap: featureManagerMap } = XRModule;
      const featureManagerConstructor = featureManagerMap[type];
      const platformFeature = this.xrDevice.createPlatformFeature(this._engine, type);
      if (platformFeature) {
        const feature = (features[type] = new featureManagerConstructor(this._engine));
        // @ts-ignore
        feature._platformFeature = platformFeature;
        return <T>feature;
      } else {
        Logger.warn("The platform interface layer of the ", XRFeatureType[type], " is not implemented.");
        return null;
      }
    }
  }

  initSession(mode: XRSessionType, requestFeatures?: IXRFeatureDescriptor[]): Promise<void> {
    if (this._sessionState !== XRSessionState.NotInitialized) {
      return Promise.reject(new Error("Please destroy the old session first"));
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      this.xrDevice.isSupported(mode).then(() => {
        if (requestFeatures) {
          // 2. Reset all feature
          this.disableAllFeatures();
          // 3. Check is this class is implemented
          const supportedArr = [];
          for (let i = 0, n = requestFeatures.length; i < n; i++) {
            const descriptor = requestFeatures[i];
            const feature = this.getFeature(descriptor.type);
            if (feature) {
              feature.enabled = true;
              feature.descriptor = descriptor;
              supportedArr.push(feature.isSupported());
            } else {
              reject(new Error(XRFeatureType[descriptor.type] + " class is not implemented."));
              return;
            }
          }
          // 4. Check if this feature is supported
          Promise.all(supportedArr).then(() => {
            // 5. Initialize session
            this.sessionManager.initialize(mode, requestFeatures).then(() => {
              // 6. Initialize all features
              const initializeArr = [];
              const { _features: features } = this;
              for (let i = 0, n = features.length; i < n; i++) {
                const feature = features[i];
                feature?.enabled && initializeArr.push(feature.initialize());
              }
              Promise.all(initializeArr).then(() => {
                this._mode = mode;
                this._requestFeatures = requestFeatures;
                this._setSessionState(XRSessionState.Initialized);
                resolve();
              }, reject);
            }, reject);
          }, reject);
        } else {
          reject(new Error("Without any feature"));
        }
      }, reject);
    });
  }

  destroySession(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager.destroy().then(() => {
        this._setSessionState(XRSessionState.NotInitialized);
        resolve();
      }, reject);
    });
  }

  startSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager.start().then(() => {
        this._setSessionState(XRSessionState.Running);
        resolve();
      }, reject);
    });
  }

  stopSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager.stop().then(() => {
        this._setSessionState(XRSessionState.Paused);
        resolve();
      }, reject);
    });
  }

  destroy(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?._onDestroy();
    }
    features.length = 0;
    this.inputManager._onDestroy();
    this.sessionManager.destroy();
    this.resetSessionStateChangeListener();
  }

  addSessionStateChangeListener(listener: TXRSessionStateChangeListener): void {
    this._listeners.push(listener);
  }

  removeSessionStateChangeListener(listener: TXRSessionStateChangeListener): void {
    Utils.removeFromArray(this._listeners, listener);
  }

  resetSessionStateChangeListener(): void {
    this._listeners.length = 0;
  }

  constructor(engine: Engine, xrDevice: IXRDevice) {
    this._engine = engine;
    this.xrDevice = xrDevice;
    this.sessionManager = xrDevice.createSessionManager(engine);
    this.inputManager = xrDevice.createInputManager(engine);
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._sessionState !== XRSessionState.Running) return;
    this.inputManager._onUpdate();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?._onUpdate();
    }
  }

  private _setSessionState(value: XRSessionState) {
    const { _features: features } = this;
    const from = this._sessionState;
    this._sessionState = value;
    this._dispatchSessionStateChange(from, value);
    switch (value) {
      case XRSessionState.Initialized:
        this.inputManager._onSessionInit();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature._onSessionInit();
        }
        break;
      case XRSessionState.Running:
        this.inputManager._onSessionStart();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature._onSessionStart();
        }
        break;
      case XRSessionState.Paused:
        this.inputManager._onSessionStop();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature._onSessionStop();
        }
        break;
      case XRSessionState.NotInitialized:
        this.inputManager._onSessionDestroy();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature._onSessionDestroy();
        }
        break;
      default:
        break;
    }
  }

  private _dispatchSessionStateChange(from: XRSessionState, to: XRSessionState): void {
    const listeners = this._listeners;
    for (let i = 0, n = listeners.length; i < n; i++) {
      listeners[i](from, to);
    }
  }
}

export function registerXRFeatureManager(feature: XRFeatureType) {
  return (featureManagerConstructor: TXRFeatureManagerConstructor) => {
    XRModule._featureManagerMap[feature] = featureManagerConstructor;
  };
}
