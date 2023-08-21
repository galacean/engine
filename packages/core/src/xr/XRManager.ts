import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { IXRFeatureDescriptor } from "./descriptor/IXRFeatureDescriptor";
import { IXRSessionDescriptor } from "./descriptor/IXRSessionDescriptor";
import { EnumXRFeature } from "./enum/EnumXRFeature";
import { EnumXRInputSource } from "./enum/EnumXRInputSource";
import { EnumXRMode } from "./enum/EnumXRMode";
import { XRFeature } from "./feature/XRFeature";
import { IXRPlatform } from "./interface/IXRPlatform";
import { IXRSession } from "./interface/IXRSession";
import { XRViewer } from "./input/XRViewer";
import { XRInputManager } from "./input/XRInputManager";
import { IXRFeatureProvider } from "./feature/IXRFeatureProvider";

type FeatureConstructor = new (engine: Engine, descriptor: IXRFeatureDescriptor) => XRFeature;
type ProviderConstructor = new (session: IXRSession) => IXRFeatureProvider;

export class XRManager {
  // @internal
  static _featureMap: FeatureConstructor[] = [];
  // @internal
  static _providerMap: ProviderConstructor[] = [];

  inputManager: XRInputManager;

  private _engine: Engine;
  private _session: IXRSession;
  private _xrPlatform: IXRPlatform;
  private _features: XRFeature[] = [];
  private _isPaused: boolean = true;

  isSupported(mode: EnumXRMode): Promise<void> {
    return this._xrPlatform.isSupported(mode);
  }

  isSupportedFeature(descriptors: IXRFeatureDescriptor | IXRFeatureDescriptor[]): Promise<void> {
    const { _xrPlatform: xrPlatform } = this;
    if (descriptors instanceof Array) {
      const promiseArr = [];
      for (let i = 0, n = descriptors.length; i < n; i++) {
        promiseArr.push(xrPlatform.isSupportedFeature(descriptors[i]));
      }
      return new Promise((resolve, reject) => {
        Promise.all(promiseArr).then(() => {
          resolve;
        }, reject);
      });
    } else {
      return xrPlatform.isSupportedFeature(descriptors);
    }
  }

  enableFeature(type: EnumXRFeature): void {
    this._features[type].onEnable();
  }

  disableFeature(type: EnumXRFeature): void {
    this._features[type].onDisable();
  }

  getFeature<T extends XRFeature>(type: new (engine: Engine, descriptor: IXRFeatureDescriptor) => T): T {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features;
      if (feature instanceof type) {
        return feature;
      }
    }
  }

  attachCamera(source: EnumXRInputSource, camera: Camera): void {
    this.inputManager.getInput<XRViewer>(source).attachCamera(camera);
  }

  detachCamera(source: EnumXRInputSource): void {
    this.inputManager.getInput<XRViewer>(source).detachCamera();
  }

  createSession(sessionDescriptor: IXRSessionDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._session) {
        reject(new Error("There is a running xr session, destroy it first and try again."));
        return;
      }
      this._xrPlatform.createSession(this._engine, sessionDescriptor).then((session) => {
        this._session = session;
        const { _engine: engine, _features: features } = this;
        const { _featureMap: featureMap, _providerMap: providerMap } = XRManager;
        const { requestFeatures } = sessionDescriptor;
        for (let i = 0, n = requestFeatures.length; i < n; i++) {
          const featureDescriptor = requestFeatures[i];
          const { type } = featureDescriptor;
          const feature = (features[type] = new featureMap[type](engine, featureDescriptor));
          feature.setProvider(new providerMap[type](session));
        }
        this._xrPlatform;
        resolve();
      }, reject);
    });
  }

  destroySession(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._session) {
        reject(new Error("没有正在运行的 XR 会话"));
        return;
      }
      this._xrPlatform.destroySession(this._session).then(() => {
        this._session = null;
        this._isPaused = true;
        resolve();
      }, reject);
    });
  }

  start(): Promise<void> {
    const { _session: session, inputManager } = this;
    return session.start().then(() => {
      inputManager._provider.attach(session, inputManager._inputs);
      const { _features: features } = this;
      for (let i = 0, n = features.length; i < n; i++) {
        features[i]?.onEnable();
      }
      this._isPaused = false;
    });
  }

  stop(): Promise<void> {
    return this._session.stop().then(() => {
      const { _features: features } = this;
      for (let i = 0, n = features.length; i < n; i++) {
        features[i]?.onDisable();
      }
      this._isPaused = true;
    });
  }

  destroy(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onDestroy();
    }
    features.length = 0;
    this._isPaused = true;
    this._session?.destroy();
  }

  /**
   * @internal
   */
  _update(): void {
    if (this._isPaused) return;
    this.inputManager._provider.update();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onUpdate();
    }
  }

  constructor(engine: Engine, xrPlatform: new (engine: Engine) => IXRPlatform) {
    this._engine = engine;
    this._xrPlatform = new xrPlatform(engine);
    this.inputManager = new XRInputManager(engine);
    this.inputManager.initialize(new this._xrPlatform.inputProvider(engine));
  }
}

export function registerXRFeature(feature: EnumXRFeature) {
  return (featureConstructor: FeatureConstructor) => {
    XRManager._featureMap[feature] = featureConstructor;
  };
}

export function registerXRProvider(feature: EnumXRFeature) {
  return (providerConstructor: ProviderConstructor) => {
    XRManager._providerMap[feature] = providerConstructor;
  };
}
