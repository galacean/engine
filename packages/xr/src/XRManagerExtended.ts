import { CameraClearFlags, CameraType, Engine, Entity, XRManager } from "@galacean/engine";
import { IXRDevice } from "@galacean/engine-design";
import { XRFeature } from "./feature/XRFeature";
import { XRFeatureType } from "./feature/XRFeatureType";
import { XRCameraManager } from "./feature/camera/XRCameraManager";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";
import { XRSessionMode } from "./session/XRSessionMode";
import { XRSessionState } from "./session/XRSessionState";
/**
 * @internal
 */
export class XRManagerExtended extends XRManager {
  /** @internal */
  static _featureMap: Map<TFeatureConstructor<XRFeature>, XRFeatureType> = new Map();

  override inputManager: XRInputManager;
  override sessionManager: XRSessionManager;
  override cameraManager: XRCameraManager;

  /** @internal */
  _platformDevice: IXRDevice;

  private _features: XRFeature[];
  private _origin: Entity;

  override get features(): XRFeature[] {
    return this._features;
  }

  override get origin(): Entity {
    return this._origin;
  }

  override set origin(value: Entity) {
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot set origin when the session is initialized.");
    }
    this._origin = value;
  }

  override isSupportedFeature<T extends XRFeature>(feature: TFeatureConstructor<T>): boolean {
    return this._platformDevice.isSupportedFeature(XRManagerExtended._featureMap.get(feature));
  }

  override addFeature<T extends new (xrManager: XRManagerExtended, ...args: any[]) => XRFeature>(
    type: T,
    ...args: TFeatureConstructorArguments<T>
  ): InstanceType<T> | null {
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot add feature when the session is initialized.");
    }
    if (!this._platformDevice.isSupportedFeature(XRManagerExtended._featureMap.get(type))) {
      throw new Error("The feature is not supported");
    }
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      if (features[i] instanceof type) throw new Error("The feature has been added");
    }
    const feature = new type(this, ...args) as InstanceType<T>;
    features.push(feature);
    return feature;
  }

  override getFeature<T extends XRFeature>(type: TFeatureConstructor<T>): T | null {
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) {
        return feature;
      }
    }
  }

  override enterXR(sessionMode: XRSessionMode, autoRun: boolean = true): Promise<void> {
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
        sessionManager._setState(XRSessionState.Initializing);
        // 2. Initialize session
        sessionManager._initialize(sessionMode, this.features).then(() => {
          autoRun && sessionManager.run();
          resolve();
        }, reject);
      }, reject);
    });
  }

  override exitXR(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager._exit().then(() => {
        resolve();
      }, reject);
    });
  }

  override _initialize(engine: Engine, xrDevice: IXRDevice): void {
    this._features = [];
    this._platformDevice = xrDevice;
    this.sessionManager = new XRSessionManager(this, engine);
    this.inputManager = new XRInputManager(this, engine);
    this.cameraManager = new XRCameraManager(this);
  }

  override _update(): void {
    const { sessionManager } = this;
    if (sessionManager.state !== XRSessionState.Running) return;
    sessionManager._onUpdate();
    this.inputManager._onUpdate();
    this.cameraManager._onUpdate();
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onUpdate();
    }
  }

  override _destroy(): void {
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

  override _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number {
    return this.sessionManager._getRequestAnimationFrame();
  }

  override _getCancelAnimationFrame(): (id: number) => void {
    return this.sessionManager._getCancelAnimationFrame();
  }

  override _getCameraClearFlagsMask(type: CameraType): CameraClearFlags {
    return this.cameraManager._getCameraClearFlagsMask(type);
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionStop();
    }
  }

  /**
   * @internal
   */
  _onSessionInit(): void {
    const { features } = this;
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
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionStart();
    }
  }

  /**
   * @internal
   */
  _onSessionExit(): void {
    this.cameraManager._onSessionExit();
    const { features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      feature.enabled && feature._onSessionExit();
      feature._onDestroy();
    }
    features.length = 0;
  }
}

/**
 * @internal
 */
export function registerXRFeature<T extends XRFeature>(type: XRFeatureType): (feature: TFeatureConstructor<T>) => void {
  return (feature: TFeatureConstructor<T>) => {
    XRManagerExtended._featureMap.set(feature, type);
  };
}

export interface IXRListener {
  fn: (...args: any[]) => any;
  destroyed?: boolean;
}

type TFeatureConstructor<T extends XRFeature> = new (xrManager: XRManagerExtended, ...args: any[]) => T;

type TFeatureConstructorArguments<T extends new (xrManager: XRManagerExtended, ...args: any[]) => XRFeature> =
  T extends new (xrManager: XRManagerExtended, ...args: infer P) => XRFeature ? P : never;

declare module "@galacean/engine" {
  interface XRManager {
    /** Input manager for XR. */
    inputManager: XRInputManager;
    /** Session manager for XR. */
    sessionManager: XRSessionManager;
    /** Camera manager for XR. */
    cameraManager: XRCameraManager;

    /** Initialized features. */
    get features(): XRFeature[];

    /**
     * The current origin of XR space.
     * @remarks The connection point between the virtual world and the real world ( XR Space )
     */
    get origin(): Entity;
    set origin(value: Entity);

    /**
     * Check if the specified feature is supported.
     * @param type - The type of the feature
     * @returns If the feature is supported
     */
    isSupportedFeature<T extends XRFeature>(feature: TFeatureConstructor<T>): boolean;

    /**
     * Add feature based on the xr feature type.
     * @param type - The type of the feature
     * @param args - The constructor params of the feature
     * @returns The feature which has been added
     */
    addFeature<T extends new (xrManager: XRManagerExtended, ...args: any[]) => XRFeature>(
      type: T,
      ...args: TFeatureConstructorArguments<T>
    ): InstanceType<T> | null;

    /**
     * Get feature which match the type.
     * @param type - The type of the feature
     * @returns	The feature which match type
     */
    getFeature<T extends XRFeature>(type: TFeatureConstructor<T>): T | null;
    /**
     * Enter XR immersive mode, when you call this method, it will initialize and display the XR virtual world.
     * @param sessionMode - The mode of the session
     * @param autoRun - Whether to automatically run the session, when `autoRun` is set to true, xr will start working immediately after initialization. Otherwise, you need to call `sessionManager.run` later to work.
     * @returns A promise that resolves if the XR virtual world is entered, otherwise rejects
     */
    enterXR(sessionMode: XRSessionMode, autoRun?: boolean): Promise<void>;
    /**
     * Exit XR immersive mode, when you call this method, it will destroy the XR virtual world.
     * @returns A promise that resolves if the XR virtual world is destroyed, otherwise rejects
     */
    exitXR(): Promise<void>;

    /**
     * @internal
     */
    _initialize(engine: Engine, xrDevice: IXRDevice): void;

    /**
     * @internal
     */
    _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number;

    /**
     * @internal
     */
    _getCancelAnimationFrame(): (id: number) => void;

    /**
     * @internal
     */
    _getCameraClearFlagsMask(type: CameraType): CameraClearFlags;

    /**
     * @internal
     */
    _update(): void;

    /**
     * @internal
     */
    _destroy(): void;
  }
}

// 实现混入的函数
function ApplyMixins(derivedCtor: any, baseCtors: any[]): void {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null)
      );
    });
  });
}

ApplyMixins(XRManager, [XRManagerExtended]);
