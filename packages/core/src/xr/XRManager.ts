import { IXRDevice } from "@galacean/engine-design/src/xr/IXRDevice";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { XRFeature } from "./feature/XRFeature";
import { XRFeatureType } from "./feature/XRFeatureType";
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
  readonly inputManager: XRInputManager;
  /** Session manager for XR. */
  readonly sessionManager: XRSessionManager;
  /** Camera manager for XR. */
  readonly cameraManager: XRCameraManager;

  /** @internal */
  _platformDevice: IXRDevice;

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
    this._platformDevice = xrDevice;
    this.sessionManager = new XRSessionManager(engine);
    this.inputManager = new XRInputManager(engine);
    this.cameraManager = new XRCameraManager(this);
  }

  /**
   * Check if the specified feature is supported.
   * @param type - The type of the feature
   * @returns If the feature is supported
   */
  isSupportedFeature(type: XRFeatureType): boolean {
    return this._platformDevice.isSupportedFeature(type);
  }

  /**
   * Add feature based on the xr feature type.
   * @param type - The type of the feature
   * @param constructor - The constructor params of the feature
   * @returns The feature which has been added
   */
  addFeature<T extends new (xrManager: XRManager, ...args: any[]) => XRFeature>(
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
    const feature = new type(this, ...constructor);
    this._features.push(feature);
    return feature;
  }

  /**
   * Get feature which match the type.
   * @param type - The type of the feature
   * @returns	The feature which match type
   */
  getFeature<T extends XRFeature>(type: new (xrManager: XRManager, ...args: any[]) => T): T | null {
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
   * @param type - The type of the feature
   */
  getFeatures<T extends XRFeature>(type: new (xrManager: XRManager, ...args: any[]) => T): T[];

  /**
   * Get all initialized features at this moment.
   * @param type - The type of the feature
   * @param out - Save all features in `out`
   */
  getFeatures<T extends XRFeature>(type: new (xrManager: XRManager, ...args: any[]) => T, out: T[]): T[];

  getFeatures<T extends XRFeature>(type: new (xrManager: XRManager, ...args: any[]) => T, out?: T[]): T[] {
    if (out) {
      out.length = 0;
    } else {
      out = [];
    }
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i--) {
      const feature = features[i];
      feature instanceof type && out.push(feature);
    }
    return out;
  }

  /**
   * Enter XR immersive mode, when you call this method, it will initialize and display the XR virtual world.
   * @param sessionMode - The mode of the session
   * @param autoRun - Whether to automatically run the session, when `autoRun` is set to true, xr will start working immediately after initialization. Otherwise, you need to call `sessionManager.run` later to work.
   * @returns A promise that resolves if the XR virtual world is entered, otherwise rejects
   */
  enterXR(sessionMode: XRSessionMode, autoRun: boolean = true): Promise<void> {
    const { sessionManager } = this;
    if (sessionManager._platformSession) {
      throw new Error("Please exit XR immersive mode first.");
    }
    if (!this._origin) {
      throw new Error("Please set origin before enter XR.");
    }
    return new Promise((resolve, reject) => {
      // 1. Check if this xr mode is supported
      sessionManager.isSupportedMode(sessionMode).then(() => {
        // 2. Initialize session
        sessionManager._initialize(sessionMode, this._features).then(() => {
          autoRun && sessionManager.run();
          resolve();
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
      this.sessionManager._end().then(() => {
        resolve();
      }, reject);
    });
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
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onUpdate();
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
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
  _onSessionInit(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionInit();
    }
  }

  /**
   * @internal
   */
  _onSessionStart(): void {
    this.cameraManager._onSessionStart();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionStart();
    }
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionStop();
    }
  }

  /**
   * @internal
   */
  _onSessionExit(): void {
    this.cameraManager._onSessionExit();
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionExit();
      feature._onDestroy();
    }
    features.length = 0;
  }
}

type TConstructor<T extends new (xrManager: XRManager, ...args: any[]) => XRFeature> = T extends new (
  xrManager: XRManager,
  ...args: infer P
) => XRFeature
  ? P
  : never;
