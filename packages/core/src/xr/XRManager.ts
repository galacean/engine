import { IXRFeatureDescriptor, IXRFeature } from "@galacean/engine-design";
import { XRInputManager } from "./input/XRInputManager";
import { XRFeatureType } from "./feature/XRFeatureType";
import { XRSessionManager } from "./session/XRSessionManager";
import { XRSessionState } from "./session/XRSessionState";
import { XRSessionMode } from "./session/XRSessionMode";
import { XRFeatureManager } from "./feature/XRFeatureManager";
import { IXRDevice } from "@galacean/engine-design/src/xr/IXRDevice";
import { Engine } from "../Engine";
import { Scene } from "../Scene";
import { Entity } from "../Entity";

type TXRFeatureManager = XRFeatureManager<IXRFeatureDescriptor, IXRFeature>;
type TXRFeatureManagerConstructor = new (engine: Engine) => TXRFeatureManager;

/**
 * XRManager is the entry point of the XR system.
 */
export class XRManager {
  /** @internal */
  static _featureManagerMap: TXRFeatureManagerConstructor[] = [];

  /** Input manager for XR. */
  inputManager: XRInputManager;
  /** Session manager for XR. */
  sessionManager: XRSessionManager;

  /** @internal */
  _xrDevice: IXRDevice;

  private _engine: Engine;
  private _scene: Scene;
  private _origin: Entity;
  private _mode: XRSessionMode;
  private _features: TXRFeatureManager[] = [];

  /**
   * The current xr scene.
   */
  get scene(): Scene {
    return (this._scene ||= this._engine.sceneManager.scenes[0]);
  }

  set scene(value: Scene) {
    if (this._scene !== value) {
      this._scene = value;
      this._origin && value.addRootEntity(this._origin);
    }
  }

  /**
   * The current xr origin.
   */
  get origin(): Entity {
    return (this._origin ||= this.scene?.createRootEntity());
  }

  set origin(value: Entity) {
    if (this._origin !== value) {
      this._origin = value;
    }
  }

  /**
   * The current session mode( AR or VR ).
   */
  get mode(): XRSessionMode {
    return this._mode;
  }

  /**
   * Check if the specified mode is supported.
   * @param mode - The mode to check
   * @returns A promise that resolves if the mode is supported, otherwise rejects
   */
  isSupportedSessionMode(mode: XRSessionMode): Promise<void> {
    return this._xrDevice.isSupportedSessionMode(mode);
  }

  /**
   * Check if the specified feature is supported.
   * @param descriptors - The feature descriptor to check
   * @returns A promise that resolves if the feature is supported, otherwise rejects
   */
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
      const feature = this.getFeatureManager(descriptors.type);
      if (feature) {
        return feature.isSupported(descriptors);
      } else {
        return Promise.reject(
          "The platform interface layer of the " + XRFeatureType[descriptors.type] + " is not implemented."
        );
      }
    }
  }

  /**
   * Disable all features.
   */
  disableAllFeatures(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i] && (features[i].enabled = false);
    }
  }

  /**
   * Get the feature manager.
   * @param type - The type of feature manager
   * @returns The feature manager
   */
  getFeatureManager<T extends XRFeatureManager>(type: XRFeatureType): T {
    const { _features: features } = this;
    const feature = features[type];
    if (feature) {
      return <T>feature;
    } else {
      const { _featureManagerMap: featureManagerMap } = XRManager;
      const featureManagerConstructor = featureManagerMap[type];
      const platformFeature = this._xrDevice.createFeature(type);
      const feature = (features[type] = new featureManagerConstructor(this._engine));
      feature._platformFeature = platformFeature;
      return <T>feature;
    }
  }

  /**
   * Initialize the session.
   * @param mode - The mode of the session
   * @param requestFeatures - The requested features
   * @returns A promise that resolves if the session is initialized, otherwise rejects
   */
  initSession(mode: XRSessionMode, requestFeatures?: IXRFeatureDescriptor[]): Promise<void> {
    if (this.sessionManager.state !== XRSessionState.None) {
      return Promise.reject(new Error("Please destroy the old session first"));
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      this._xrDevice.isSupportedSessionMode(mode).then(() => {
        if (requestFeatures) {
          // 2. Reset all feature
          this.disableAllFeatures();
          // 3. Check is this class is implemented
          const supportedArr = [];
          for (let i = 0, n = requestFeatures.length; i < n; i++) {
            const descriptor = requestFeatures[i];
            const feature = this.getFeatureManager(descriptor.type);
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
            this.sessionManager.initialize(mode, requestFeatures).then((session) => {
              // 6. Initialize all features
              const initializeArr = [];
              const { _features: features } = this;
              for (let i = 0, n = features.length; i < n; i++) {
                const feature = features[i];
                feature?.enabled && initializeArr.push(feature.initialize());
              }
              Promise.all(initializeArr).then(() => {
                this._mode = mode;
                this.inputManager._onSessionInit(session);
                for (let i = 0, n = features.length; i < n; i++) {
                  const feature = features[i];
                  feature?.enabled && feature.onSessionInit();
                }
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

  /**
   * Destroy the session.
   * @returns A promise that resolves if the session is destroyed, otherwise rejects
   */
  destroySession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { sessionManager } = this;
      sessionManager.destroy().then(() => {
        const { _features: features } = this;
        this.inputManager._onSessionDestroy();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          if (feature?.enabled) {
            feature.enabled = false;
            feature.onSessionDestroy();
          }
        }
        resolve();
      }, reject);
    });
  }

  /**
   * Start the session.
   * @returns A promise that resolves if the session is started, otherwise rejects
   */
  startSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { sessionManager } = this;
      sessionManager.start().then(() => {
        const { _features: features } = this;
        this.inputManager._onSessionStart();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature.onSessionStart();
        }
        resolve();
      }, reject);
    });
  }

  /**
   * Stop the session.
   * @returns A promise that resolves if the session is stopped, otherwise rejects
   */
  stopSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager.stop().then(() => {
        const { _features: features } = this;
        this.inputManager._onSessionStop();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          feature?.enabled && feature.onSessionStop();
        }
        resolve();
      }, reject);
    });
  }

  /**
   * Destroy xr module.
   */
  destroy(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onDestroy();
    }
    features.length = 0;
    this.inputManager._onDestroy();
    this.sessionManager.destroy();
  }

  constructor(engine: Engine, xrDevice: IXRDevice) {
    this._engine = engine;
    this._xrDevice = xrDevice;
    this.sessionManager = new XRSessionManager(engine);
    this.inputManager = new XRInputManager(engine);
  }

  /**
   * @internal
   */
  _update(): void {
    const { sessionManager } = this;
    if (sessionManager.state !== XRSessionState.Running) return;
    sessionManager._onUpdate();
    this.inputManager._onUpdate();
    const { session } = sessionManager;
    const { frame } = session;
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onUpdate(session, frame);
    }
  }
}

export function registerXRFeatureManager(feature: XRFeatureType) {
  return (featureManagerConstructor: TXRFeatureManagerConstructor) => {
    XRManager._featureManagerMap[feature] = featureManagerConstructor;
  };
}
