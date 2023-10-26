import { IXRFeature, IXRFeatureDescriptor } from "@galacean/engine-design";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { XRFeatureManager } from "./feature/XRFeatureManager";
import { IXRDevice } from "./IXRDevice";
import { XRViewer } from "./input/XRViewer";
import { XRInputManager } from "./input/XRInputManager";
import { EnumXRMode } from "./enum/EnumXRMode";
import { EnumXRInputSource } from "./enum/EnumXRInputSource";
import { EnumXRFeature } from "./enum/EnumXRFeature";
import { XRSessionManager } from "./session/XRSessionManager";
import { EnumXRSessionState } from "./enum/EnumXRSessionState";
import { Logger } from "../base";

type FeatureManagerConstructor = new (engine: Engine) => XRFeatureManager;
type PlatformFeatureConstructor = new (engine: Engine) => IXRFeature;

export class XRModule {
  // @internal
  static _featureManagerMap: FeatureManagerConstructor[] = [];
  // @internal
  static _platformFeatureMap: PlatformFeatureConstructor[] = [];

  xrDevice: IXRDevice;
  inputManager: XRInputManager;
  sessionManager: XRSessionManager;

  private _engine: Engine;
  private _features: XRFeatureManager[] = [];
  private _sessionState: EnumXRSessionState = EnumXRSessionState.NotInitialized;

  private _mode: EnumXRMode;
  private _requestFeatures: IXRFeatureDescriptor[];

  get mode(): EnumXRMode {
    return this._mode;
  }

  get requestFeatures(): IXRFeatureDescriptor[] {
    return this._requestFeatures;
  }

  isSupported(mode: EnumXRMode): Promise<void> {
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
          resolve;
        }, reject);
      });
    } else {
      const feature = this.getFeature(descriptors.type);
      if (feature) {
        return feature.isSupported(descriptors);
      } else {
        return new Promise((resolve, reject) => {
          reject(new Error("没有实现对应的 XRPlatformFeature : " + EnumXRFeature[descriptors.type]));
        });
      }
    }
  }

  disableAllFeatures(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i] && (features[i].enabled = false);
    }
  }

  getFeature<T extends XRFeatureManager>(type: EnumXRFeature): T {
    const { _features: features } = this;
    const feature = features[type];
    if (feature) {
      return <T>feature;
    } else {
      const { _featureManagerMap: featureManagerMap, _platformFeatureMap: platformFeatureMap } = XRModule;
      const featureManagerConstructor = featureManagerMap[type];
      const platformFeatureConstructor = platformFeatureMap[type];
      if (platformFeatureConstructor) {
        const feature = (features[type] = new featureManagerConstructor(this._engine));
        feature._platformFeature = new platformFeatureConstructor(this._engine);
        return <T>feature;
      } else {
        Logger.warn(EnumXRFeature[type] + "的平台接口层未实现.");
        return null;
      }
    }
  }

  attachCamera(source: EnumXRInputSource, camera: Camera): void {
    this.inputManager.getInput<XRViewer>(source).camera = camera;
  }

  detachCamera(source: EnumXRInputSource): void {
    this.inputManager.getInput<XRViewer>(source).camera = null;
  }

  initSession(mode: EnumXRMode, requestFeatures?: IXRFeatureDescriptor[]): Promise<void> {
    if (this._sessionState !== EnumXRSessionState.NotInitialized) {
      return Promise.reject(new Error("请先销毁旧的 XR 会话"));
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      this.xrDevice.isSupported(mode).then(() => {
        if (requestFeatures) {
          // 2. Reset all feature
          this.disableAllFeatures();
          // 3. Check is this class is implemented
          const supportedArr = [];
          for (let i = requestFeatures.length - 1; i >= 0; i--) {
            const descriptor = requestFeatures[i];
            const feature = this.getFeature(descriptor.type);
            if (feature) {
              feature.enabled = true;
              feature.descriptor = descriptor;
              supportedArr.push(feature.isSupported());
            } else {
              reject(new Error(EnumXRFeature[descriptor.type] + " class is not implemented."));
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
              for (let i = features.length - 1; i >= 0; i--) {
                const feature = features[i];
                feature?.enabled && initializeArr.push(feature.initialize());
              }
              Promise.all(initializeArr).then(() => {
                this._mode = mode;
                this._sessionState = EnumXRSessionState.Paused;
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
        this._sessionState = EnumXRSessionState.NotInitialized;
        resolve();
      }, reject);
    });
  }

  startSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { sessionManager: session, inputManager } = this;
      session.start().then(() => {
        inputManager._onSessionStart();
        const { _features: features } = this;
        for (let i = 0, n = features.length; i < n; i++) {
          features[i]?._onSessionStart();
        }
        this._sessionState = EnumXRSessionState.Running;
        resolve();
      }, reject);
    });
  }

  stopSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { sessionManager: session, inputManager } = this;
      session.stop().then(() => {
        inputManager._onSessionStop();
        const { _features: features } = this;
        for (let i = 0, n = features.length; i < n; i++) {
          features[i]?._onSessionStop();
        }
        this._sessionState = EnumXRSessionState.Paused;
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
  }

  constructor(engine: Engine, xrDevice: IXRDevice) {
    this._engine = engine;
    this.xrDevice = xrDevice;
    this.inputManager = xrDevice.createInputManager(engine);
    this.sessionManager = xrDevice.createSessionManager(engine);
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._sessionState !== EnumXRSessionState.Running) return;
    this.inputManager._onUpdate();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?._onUpdate();
    }
  }
}

export function registerXRFeatureManager(feature: EnumXRFeature) {
  return (featureManagerConstructor: FeatureManagerConstructor) => {
    XRModule._featureManagerMap[feature] = featureManagerConstructor;
  };
}

export function registerXRPlatformFeature(feature: EnumXRFeature) {
  return (platformFeatureConstructor: PlatformFeatureConstructor) => {
    XRModule._platformFeatureMap[feature] = platformFeatureConstructor;
  };
}
