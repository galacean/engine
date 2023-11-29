import { IXRDevice } from "@galacean/engine-design/src/xr/IXRDevice";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Scene } from "../Scene";
import { XRFeature } from "./feature/XRFeature";
import { XRCameraManager } from "./feature/camera/XRCameraManager";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";
import { XRSessionMode } from "./session/XRSessionMode";
import { XRSessionState } from "./session/XRSessionState";

/**
 * XRManager is the entry point of the XR system.
 */
export class XRManager {
  /** Input manager for XR. */
  inputManager: XRInputManager;
  /** Session manager for XR. */
  sessionManager: XRSessionManager;
  /** Camera manager for XR. */
  cameraManager: XRCameraManager;

  /** @internal */
  _xrDevice: IXRDevice;

  private _engine: Engine;
  private _scene: Scene;
  private _origin: Entity;
  private _mode: XRSessionMode = XRSessionMode.None;
  private _features: XRFeature[] = [];

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
    if (this._origin) {
      return this._origin;
    } else {
      const { scene } = this;
      return scene.findEntityByName("XROrigin") || scene.createRootEntity("XROrigin");
    }
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
   * @internal
   */
  constructor(engine: Engine, xrDevice: IXRDevice) {
    this._engine = engine;
    this._xrDevice = xrDevice;
    this.sessionManager = new XRSessionManager(engine);
    this.inputManager = new XRInputManager(engine);
    this.cameraManager = new XRCameraManager(engine);
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
   * @param type - The type of the feature
   * @returns A promise that resolves if the feature is supported, otherwise rejects
   */
  isSupportedFeature<T extends XRFeature>(type: new (engine: Engine) => T): Promise<void> {
    const feature = this.getFeature(type);
    if (feature) {
      return feature.isSupported();
    } else {
      return Promise.reject("The platform interface layer is not implemented.");
    }
  }

  /**
   * Add feature based on the xr feature type.
   * @param type - The type of the feature
   * @param constructor - The constructor params of the feature
   * @returns The feature which has been added
   */
  addFeature<T extends new (engine: Engine, ...args: any[]) => XRFeature>(
    type: T,
    ...constructor: TConstructor<T>
  ): XRFeature | null {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) throw new Error("The feature has been added");
    }
    const feature = new type(this._engine, ...constructor);
    feature.enabled = true;
    this._features.push(feature);
    return feature;
  }

  /**
   * Get feature which match the type.
   * @param type - The type of the feature
   * @returns	The feature which match type
   */
  getFeature<T extends XRFeature>(type: new (engine: Engine, ...args: any[]) => T): T | null {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) {
        return feature;
      }
    }
  }

  /**
   * Get all initialized features at this moment.
   * Returns a read-only array.
   */
  getFeatures(): XRFeature[];
  /**
   * Get all initialized features at this moment.
   * @param out - Save all features in `out`
   */
  getFeatures(out: XRFeature[]): XRFeature[];

  getFeatures(out?: XRFeature[]): XRFeature[] {
    if (out) {
      const { _features: features } = this;
      const n = features.length;
      out.length = n;
      for (let i = 0; i < n; i--) {
        out[i] = features[i];
      }
      return out;
    } else {
      return this._features;
    }
  }

  /**
   * Enter XR immersive mode, when you call this method, it will initialize and display the XR virtual world.
   * @param sessionMode - The mode of the session
   * @param autoRun - Whether to automatically run the session
   * @returns A promise that resolves if the XR virtual world is entered, otherwise rejects
   */
  enterXR(sessionMode: XRSessionMode, autoRun: boolean = true): Promise<void> {
    if (this.sessionManager.session) {
      return Promise.reject(new Error("Please destroy the old session first."));
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      this._xrDevice.isSupportedSessionMode(sessionMode).then(() => {
        // 2. Collect all features
        const { _features: features } = this;
        const enabledFeatures = [];
        const supportedPromises = [];
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          if (feature.enabled) {
            enabledFeatures.push(feature);
            supportedPromises.push(feature.isSupported());
          }
        }

        // 3. Check if this feature is supported
        Promise.all(supportedPromises).then(() => {
          // 4. Initialize session
          this.sessionManager._initialize(sessionMode, enabledFeatures).then((session) => {
            this._mode = sessionMode;
            // 5. Initialize all features
            const initializePromises = [];
            for (let i = 0, n = enabledFeatures.length; i < n; i++) {
              initializePromises.push(enabledFeatures[i].initialize());
            }
            Promise.all(initializePromises).then(() => {
              this.cameraManager._onSessionInit();
              this.inputManager._onSessionInit(session);
              for (let i = 0, n = enabledFeatures.length; i < n; i++) {
                enabledFeatures[i].onSessionInit();
              }
              // 6. Auto run the session
              autoRun && this.sessionManager.run();
              resolve();
            }, reject);
          }, reject);
        }, reject);
      }, reject);
    });
  }

  /**
   * Exit XR immersive mode, when you call this method, it will destroy the XR virtual world.
   * @returns A promise that resolves if the XR virtual world is destroyed, otherwise rejects
   */
  exitXR(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { sessionManager } = this;
      sessionManager._destroy().then(() => {
        const { _features: features } = this;
        this.cameraManager._onSessionDestroy();
        this.inputManager._onSessionDestroy();
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          if (feature?.enabled) {
            feature.enabled = false;
            feature.onSessionDestroy();
          }
          feature.onDestroy();
        }
        features.length = 0;
        resolve();
      }, reject);
    });
  }

  /**
   * Destroy xr module.
   */
  destroy(): void {
    if (this.sessionManager.session) {
      this.exitXR().then(() => {
        this.sessionManager._onDestroy();
        this.inputManager._onDestroy();
        this.cameraManager._onDestroy();
      });
    } else {
      this.sessionManager._onDestroy();
      this.inputManager._onDestroy();
      this.cameraManager._onDestroy();
    }
  }

  /**
   * @internal
   */
  _update(): void {
    const { sessionManager } = this;
    if (sessionManager.state !== XRSessionState.Running) return;
    sessionManager._onUpdate();
    this.inputManager._onUpdate();
    this.cameraManager._onUpdate();
    const { session } = sessionManager;
    const { frame } = session;
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onUpdate(session, frame);
    }
  }
}

type TConstructor<T extends new (engine: Engine, ...args: any[]) => XRFeature> = T extends new (
  engine: Engine,
  ...args: infer P
) => XRFeature
  ? P
  : never;
