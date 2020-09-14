import { SceneFeature } from "./SceneFeature";
import { EngineFeature } from "./EngineFeature";
import { Scene } from "./Scene";
import { Engine } from "./Engine";

/**
 * 管理一组功能特性对象
 * @class
 */
export class FeatureManager<T extends EngineFeature | SceneFeature> {
  private _features: Array<new (engine: Engine) => T> = [];

  private _objects = [];

  /**
   * 注册一个功能特性
   * @param {SceneFeature|EngineFeature} Feature
   */
  public registerFeature(IFeature: new () => T): void {
    const featureArray = this._features;

    // -- 按照 type 查找，避免重复添加
    for (let i = 0, len = featureArray.length; i < len; i++) {
      if (featureArray[i] === IFeature) {
        return;
      }
    }

    // -- 添加到全局数组
    featureArray.push(IFeature);

    // -- 添加到现有场景实例中
    const objectArray = this._objects;
    for (let i = 0, len = objectArray.length; i < len; i++) {
      objectArray[i].features.push(new IFeature());
    }
  }

  /**
   * 添加一个具有功能特性的对象
   * @param {Scene|Engine} obj
   */
  public addObject(obj: Scene | Engine): void {
    obj.features = [];
    for (let i = 0, len = this._features.length; i < len; i++) {
      obj.features.push(new this._features[i]((<any>obj).engine ?? <any>obj) as any);
    }
    this._objects.push(obj);
  }

  /**
   * 调用功能特性的指定方法
   * @param {Scene|Engine} obj
   * @param {string} method
   * @param {Array} args
   */
  public callFeatureMethod(obj: Scene | Engine, method: string, args: any[]): void {
    const features = obj.features;
    const count = features.length;

    for (let i = 0; i < count; i++) {
      const feature = features[i];
      if (feature[method]) {
        feature[method].apply(feature, args);
      }
    }
  }

  /**
   * 查找特性
   * @param {Scene|Engine} obj
   * @param {SceneFeature|EngineFeature} feature
   */

  public findFeature(obj: Scene | Engine, IFeature: new () => T): T {
    const features = obj.features;
    const count = features.length;

    for (let i = 0; i < count; i++) {
      const feature = features[i];
      if (feature.constructor === (IFeature as any)) {
        return feature as any;
      }
    }
    return undefined;
  }
}
