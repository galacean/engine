import { IXRProvider, IXRFeature } from "@galacean/engine-design";
import { Logger } from "../base";
import { Engine } from "../Engine";
import { EnumXRMode } from "./enum/EnumXRMode";
import { EnumXRFeature } from "./enum/EnumXRFeature";
import { EnumXRTrackingMode } from "./enum/EnumXRTrackingMode";

export class XRManager {
  private _engine: Engine;
  private _mode: EnumXRMode;

  private _provider: IXRProvider;
  private _features: IXRFeature[] = [];
  private _isPaused: boolean = true;

  isSupportedMode(mode: EnumXRMode): Promise<void> {
    return this._provider.isSupportedMode(mode);
  }

  isSupportedFeature(feature: EnumXRFeature): Promise<void> {
    return this._provider.isSupportedFeature(feature);
  }

  addFeature<T extends IXRFeature>(feature: EnumXRFeature): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this._provider) {
        reject(new Error("xr 没有实例化"));
        return;
      }
      if (this._features[feature]) {
        Logger.warn("已经存在 feature : " + EnumXRFeature[feature]);
        resolve(this._features[feature] as T);
      } else {
        (this._provider.createFeature(feature) as Promise<T>).then((ins: T) => {
          if (ins) {
            this._features[feature] = ins;
            resolve(ins);
          } else {
            reject(new Error("Provider 没有实现这个功能."));
          }
        });
      }
    });
  }

  getFeature<T extends IXRFeature>(feature: EnumXRFeature): T {
    return this._features[feature] as T;
  }

  enableFeature(feature: EnumXRFeature): void {
    this._features[feature]?.onEnable();
  }

  disableFeature(feature: EnumXRFeature): void {
    this._features[feature]?.onDisable();
  }

  initialize(mode: EnumXRMode, trackingMode: EnumXRTrackingMode, features: EnumXRFeature[] = []): Promise<void> {
    this._mode = mode;
    return new Promise((resolve, reject) => {
      const { _provider: provider } = this;
      provider.initialize({ mode, trackingMode, features }).then(() => {
        const promiseArr = [];
        promiseArr.push(provider.createFeature(EnumXRFeature.input));
        promiseArr.push(provider.createFeature(EnumXRFeature.camera));
        for (let i = 0, n = features.length; i < n; i++) {
          promiseArr.push(provider.createFeature(features[i]));
        }
        Promise.all(promiseArr).then((features: IXRFeature[]) => {
          this._features.push(...features);
          resolve();
        });
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
    return this._provider.start();
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
    // Update provider.
    this._provider.onUpdate();
    // Update feature.
    const { _features: features } = this;
    for (let i = 0, n = features.length; i < n; i++) {
      features[i]?.onUpdate();
    }
  }

  constructor(engine: Engine, type: new (engine: Engine) => IXRProvider) {
    this._engine = engine;
    this._provider = new type(engine);
  }
}
