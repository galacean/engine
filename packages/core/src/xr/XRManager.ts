import { Engine } from "../Engine";
import { EnumXRMode } from "./enum/EnumXRMode";
import { EnumXRFeature } from "./enum/EnumXRFeature";
import { EnumXRTrackingMode } from "./enum/EnumXRTrackingMode";
import { XRFeature } from "./feature/XRFeature";
import { EnumXRSubsystem } from "./enum/EnumXRSubsystem";
import { XRProvider } from "./provider/XRProvider";
import { XRSubsystem } from "./subsystem/XRSubsystem";

type FeatureConstructor = new (engine: Engine) => XRFeature;

export class XRManager {
  // @internal
  static _subsystemDependentMap: EnumXRSubsystem[][] = [];
  // @internal
  static _featureMap: FeatureConstructor[] = [];

  private _engine: Engine;
  private _provider: XRProvider;
  private _features: XRFeature[] = [];
  private _subsystems: XRSubsystem[] = [];
  private _isPaused: boolean = true;

  isSupportedMode(mode: EnumXRMode): Promise<void> {
    return this._provider.isSupportedMode(mode);
  }

  isSupportedTrackingMode(mode: EnumXRTrackingMode): Promise<void> {
    return this._provider.isSupportedTrackingMode(mode);
  }

  isSupportedFeature(feature: EnumXRFeature): Promise<void> {
    return this._provider.isSupportedSubsystem(feature);
  }

  getFeature<T extends XRFeature>(feature: EnumXRFeature): T {
    return this._features[feature] as T;
  }

  enableFeature(feature: EnumXRFeature): void {
    this._features[feature]?.onEnable();
  }

  disableFeature(feature: EnumXRFeature): void {
    this._features[feature]?.onDisable();
  }

  getSubsystem<T extends XRSubsystem>(subsystem: EnumXRSubsystem): T {
    return this._subsystems[subsystem] as T;
  }

  initialize(mode: EnumXRMode, trackingMode: EnumXRTrackingMode, requestFeatures: EnumXRFeature[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _subsystemDependentMap: subsystemDependentMap, _featureMap: featureMap } = XRManager;
      const { _provider: provider } = this;
      let dependentSubsystems = [EnumXRSubsystem.input];
      for (let i = 0, n = requestFeatures.length; i < n; i++) {
        dependentSubsystems.push(...subsystemDependentMap[requestFeatures[i]]);
      }
      // remove duplicate subsystems
      dependentSubsystems = Array.from(new Set(dependentSubsystems));
      provider.initialize(mode, trackingMode, dependentSubsystems).then((insArr: XRSubsystem[]) => {
        const { _engine: engine, _subsystems: subsystem, _features: features } = this;
        for (let i = 0, n = insArr.length; i < n; i++) {
          subsystem[dependentSubsystems[i]] = insArr[i];
        }
        features.length = 0;
        requestFeatures.push(EnumXRFeature.input, EnumXRFeature.camera);
        for (let i = 0, n = requestFeatures.length; i < n; i++) {
          const feature = requestFeatures[i];
          features[feature] ||= new featureMap[feature](engine);
        }
        resolve();
      }, reject);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._provider.start().then(() => {
        this._isPaused = false;
        resolve();
      }, reject);
    });
  }

  pause(): void {
    if (!this._isPaused) {
      this._isPaused = true;
    }
  }

  resume(): void {
    if (this._isPaused) {
      this._isPaused = false;
    }
  }

  destroy(): void {
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onDestroy();
    }
    this._provider.onDestroy();
    this._provider = null;
  }

  /**
   * @internal
   */
  _update() {
    if (this._isPaused) {
      return;
    }
    const { _features: features, _subsystems: subsystems } = this;
    // Update provider.
    this._provider.onUpdate();
    // Update system.
    for (let i = 0, n = subsystems.length; i < n; i++) {
      subsystems[i]?.update();
    }
    // Update feature.
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onUpdate();
    }
  }

  constructor(engine: Engine, type: new (engine: Engine) => XRProvider) {
    this._engine = engine;
    this._provider = new type(engine);
  }
}

export function registerFeature(feature: EnumXRFeature, dependentSubsystem: EnumXRSubsystem[] = []) {
  return (featureConstructor: FeatureConstructor) => {
    XRManager._featureMap[feature] = featureConstructor;
    XRManager._subsystemDependentMap[feature] = dependentSubsystem;
  };
}
