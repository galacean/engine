import { IXRFeatureDescriptor } from "@galacean/engine-design";
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

type FeatureConstructor = new (engine: Engine) => XRFeatureManager;

export class XRModule {
  // @internal
  static _featureMap: FeatureConstructor[] = [];

  xrDevice: IXRDevice;
  inputManager: XRInputManager;
  sessionManager: XRSessionManager;

  private _engine: Engine;
  private _features: XRFeatureManager[] = [];
  private _isPaused: boolean = true;

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
    const { xrDevice } = this;
    if (descriptors instanceof Array) {
      const promiseArr = [];
      for (let i = 0, n = descriptors.length; i < n; i++) {
        promiseArr.push(xrDevice.isSupportedFeature(descriptors[i]));
      }
      return new Promise((resolve, reject) => {
        Promise.all(promiseArr).then(() => {
          resolve;
        }, reject);
      });
    } else {
      return xrDevice.isSupportedFeature(descriptors);
    }
  }

  enableFeature(type: EnumXRFeature): void {
    this._features[type].enabled = true;
  }

  disableFeature(type: EnumXRFeature): void {
    this._features[type].enabled = false;
  }

  getFeature<T extends XRFeatureManager>(type: new (engine: Engine, descriptor: IXRFeatureDescriptor) => T): T {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) {
        return feature;
      }
    }
  }

  attachCamera(source: EnumXRInputSource, camera: Camera): void {
    this.inputManager.getInput<XRViewer>(source).camera = camera;
  }

  detachCamera(source: EnumXRInputSource): void {
    this.inputManager.getInput<XRViewer>(source).camera = null;
  }

  initSession(mode: EnumXRMode, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    this._mode = mode;
    this._requestFeatures = requestFeatures;
    return new Promise((resolve, reject) => {
      const { _engine: engine, _features: features } = this;
      const initializeFeature = () => {
        const { _featureMap: featureMap } = XRModule;
        const promiseArr = [];
        for (let i = 0, n = requestFeatures.length; i < n; i++) {
          const featureDescriptor = requestFeatures[i];
          const { type } = featureDescriptor;
          if (type !== EnumXRFeature.MovementTracking) {
            const feature = (features[type] ||= new featureMap[type](engine));
            promiseArr.push(feature.initialize(featureDescriptor));
          }
        }
        Promise.all(promiseArr).then(() => {
          resolve();
        }, reject);
      };

      this.sessionManager.initialize(mode, requestFeatures).then(() => {
        initializeFeature();
      }, reject);
    });
  }

  destroySession(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager.destroy().then(() => {
        this._isPaused = true;
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
        this._isPaused = false;
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
        this._isPaused = true;
        resolve();
      }, reject);
    });
  }

  destroy(): void {
    this._isPaused = true;
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
    if (this._isPaused) return;
    this.inputManager._onUpdate();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?._onUpdate();
    }
  }
}

export function registerXRFeatureManager(feature: EnumXRFeature) {
  return (featureConstructor: FeatureConstructor) => {
    XRModule._featureMap[feature] = featureConstructor;
  };
}
