import { IXRDevice } from "@galacean/engine-design/src/xr/IXRDevice";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { XRFeature } from "./feature/XRFeature";
import { XRCameraManager } from "./feature/camera/XRCameraManager";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";
import { XRSessionMode } from "./session/XRSessionMode";
import { XRSessionState } from "./session/XRSessionState";
import { XRFeatureType } from "./feature/XRFeatureType";
import { XRMovementTracking } from "./feature/movementTracking/XRMovementTracking";

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
  _platformDevice: IXRDevice;

  private _engine: Engine;
  private _origin: Entity;
  private _features: XRFeature[] = [];

  /**
   * The current origin of XR space.
   * @remarks The connection point between the virtual world and the real world ( XR Space )
   */
  get origin(): Entity {
    return this._origin;
  }

  set origin(value: Entity) {
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot set origin when the session is initialized.");
    }
    this._origin = value;
  }

  /**
   * @internal
   */
  constructor(engine: Engine, xrDevice: IXRDevice) {
    this._engine = engine;
    this._platformDevice = xrDevice;
    this.sessionManager = new XRSessionManager(engine);
    this.inputManager = new XRInputManager(engine);
    this.cameraManager = new XRCameraManager(engine);

    this.addFeature(XRMovementTracking)
  }

  /**
   * Check if the specified feature is supported.
   * @param type - The type of the feature
   * @returns A promise that resolves if the feature is supported, otherwise rejects
   */
  isSupportedFeature(type: XRFeatureType): Promise<void> {
    return this._platformDevice.isSupportedFeature(type);
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
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot add feature when the session is initialized.");
    }
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
    if (this.sessionManager._platformSession) {
      throw new Error("Please destroy the old session first.");
    }
    if (this._origin) {
      throw new Error("Please set origin before enter XR.");
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      this.sessionManager.isSupportedMode(sessionMode).then(() => {
        // 2. Collect all features
        const { _features: features } = this;
        const enabledFeatures = [];
        const supportedPromises = [];
        for (let i = 0, n = features.length; i < n; i++) {
          const feature = features[i];
          if (feature.enabled) {
            enabledFeatures.push(feature);
            supportedPromises.push(feature._isSupported());
          }
        }

        // 3. Check if this feature is supported
        Promise.all(supportedPromises).then(() => {
          // 4. Initialize session
          this.sessionManager._initialize(sessionMode, enabledFeatures).then((session) => {
            // 6. Auto run the session
            autoRun && this.sessionManager.run();
            resolve();
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
        resolve();
      }, reject);
    });
  }

  /**
   * Destroy xr module.
   */
  destroy(): void {
    if (this.sessionManager._platformSession) {
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
    const { _platformSession: platformSession } = sessionManager;
    const { frame: platformFrame } = platformSession;
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onUpdate(platformSession, platformFrame);
    }
  }

  /**
   * @internal
   */
  _onSessionInit(): void {
    const features = this.getFeatures();
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onSessionInit();
    }
  }

  /**
   * @internal
   */
  _onSessionStart(): void {
    this.cameraManager._onSessionStart();
    const features = this.getFeatures();
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onSessionStart();
    }
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    const features = this.getFeatures();
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature?.enabled && feature.onSessionStop();
    }
  }

  /**
   * @internal
   */
  _onSessionDestroy(): void {
    this.cameraManager._onSessionDestroy();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature?.enabled) {
        feature.enabled = false;
        feature.onSessionDestroy();
      }
      feature.onDestroy();
    }
    features.length = 0;
  }
}

type TConstructor<T extends new (engine: Engine, ...args: any[]) => XRFeature> = T extends new (
  engine: Engine,
  ...args: infer P
) => XRFeature
  ? P
  : never;
