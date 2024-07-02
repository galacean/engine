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
 * XRManager is the entry point of the XR system.
 */
export class XRManagerExtended extends XRManager {
  /** @internal */
  static _featureMap: Map<TFeatureConstructor<XRFeature>, XRFeatureType> = new Map();

  /** Input manager for XR. */
  override inputManager: XRInputManager;
  /** Session manager for XR. */
  override sessionManager: XRSessionManager;
  /** Camera manager for XR. */
  override cameraManager: XRCameraManager;

  /** @internal */
  _platformDevice: IXRDevice;

  private _origin: Entity;
  private _features: XRFeature[];

  /**
   * The current origin of XR space.
   * @remarks The connection point between the virtual world and the real world ( XR Space )
   */
  override get origin(): Entity {
    return this._origin;
  }

  override set origin(value: Entity) {
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot set origin when the session is initialized.");
    }
    this._origin = value;
  }

  /**
   * Check if the specified feature is supported.
   * @param type - The type of the feature
   * @returns If the feature is supported
   */
  override isSupportedFeature<T extends XRFeature>(feature: TFeatureConstructor<T>): boolean {
    return this._platformDevice.isSupportedFeature(XRManagerExtended._featureMap.get(feature));
  }

  /**
   * Add feature based on the xr feature type.
   * @param type - The type of the feature
   * @param args - The constructor params of the feature
   * @returns The feature which has been added
   */
  override addFeature<T extends new (xrManager: XRManagerExtended, ...args: any[]) => XRFeature>(
    type: T,
    ...args: TFeatureConstructorArguments<T>
  ): XRFeature | null {
    if (this.sessionManager._platformSession) {
      throw new Error("Cannot add feature when the session is initialized.");
    }
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) throw new Error("The feature has been added");
    }
    const feature = new type(this, ...args);
    this._features.push(feature);
    return feature;
  }

  /**
   * Get feature which match the type.
   * @param type - The type of the feature
   * @returns	The feature which match type
   */
  override getFeature<T extends XRFeature>(type: TFeatureConstructor<T>): T | null {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (feature instanceof type) {
        return feature;
      }
    }
  }

  override getFeatures(out?: XRFeature[]): XRFeature[] {
    const { _features: features } = this;
    const length = features.length;
    if (out) {
      out.length = length;
    } else {
      out = new Array<XRFeature>(length);
    }
    for (let i = 0; i < length; i--) {
      out[i] = features[i];
    }
    return out;
  }

  /**
   * Enter XR immersive mode, when you call this method, it will initialize and display the XR virtual world.
   * @param sessionMode - The mode of the session
   * @param autoRun - Whether to automatically run the session, when `autoRun` is set to true, xr will start working immediately after initialization. Otherwise, you need to call `sessionManager.run` later to work.
   * @returns A promise that resolves if the XR virtual world is entered, otherwise rejects
   */
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
  override exitXR(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionManager._exit().then(() => {
        resolve();
      }, reject);
    });
  }

  /**
   * @internal
   */
  override _initialize(engine: Engine, xrDevice: IXRDevice): void {
    this._features = [];
    this._platformDevice = xrDevice;
    this.sessionManager = new XRSessionManager(this, engine);
    this.inputManager = new XRInputManager(this, engine);
    this.cameraManager = new XRCameraManager(this);
  }

  /**
   * @internal
   */
  override _update(): void {
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

  /**
   * @internal
   */
  override _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number {
    return this.sessionManager._getRequestAnimationFrame();
  }

  /**
   * @internal
   */
  override _getCancelAnimationFrame(): (id: number) => void {
    return this.sessionManager._getCancelAnimationFrame();
  }

  /**
   * @internal
   */
  override _getCameraClearFlagsMask(type: CameraType): CameraClearFlags {
    return this.cameraManager._getCameraClearFlagsMask(type);
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

/**
 * @internal
 */
export function registerXRFeature<T extends XRFeature>(type: XRFeatureType): (feature: TFeatureConstructor<T>) => void {
  return (feature: TFeatureConstructor<T>) => {
    XRManagerExtended._featureMap.set(feature, type);
  };
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

    /**
     * The current origin of XR space.
     * @remarks The connection point between the virtual world and the real world ( XR Space )
     */
    get origin(): Entity;
    set origin(value: Entity);

    /**
     * Get all initialized features at this moment.
     */
    getFeatures(): XRFeature[];

    /**
     * Get all initialized features at this moment.
     * @param out - Save all features in `out`
     */
    getFeatures(out: XRFeature[]): XRFeature[];

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
    ): XRFeature | null;

    /**
     * Get feature which match the type.
     * @param type - The type of the feature
     * @returns	The feature which match type
     */
    getFeature<T extends XRFeature>(type: TFeatureConstructor<T>): T | null;
    getFeatures(out?: XRFeature[]): XRFeature[];
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
