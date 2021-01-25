import { SceneFeature } from "./SceneFeature";
import { EngineFeature } from "./EngineFeature";
import { Scene } from "./Scene";
import { Engine } from "./Engine";

/**
 * Manage a set of feature objects.
 */
export class FeatureManager<T extends EngineFeature | SceneFeature> {
  private _features: Array<new (engine: Engine) => T> = [];

  private _objects = [];

  /**
   * Register a feature.
   * @param {SceneFeature|EngineFeature} Feature
   */
  public registerFeature(IFeature: new () => T): void {
    const featureArray = this._features;

    // Search by type, avoid adding
    for (let i = 0, len = featureArray.length; i < len; i++) {
      if (featureArray[i] === IFeature) {
        return;
      }
    }

    // Add to global array
    featureArray.push(IFeature);

    // Add to existing scene
    const objectArray = this._objects;
    for (let i = 0, len = objectArray.length; i < len; i++) {
      objectArray[i].features.push(new IFeature());
    }
  }

  /**
   * Add an feature with functional characteristics.
   * @param {Scene|Engine} obj - Scene or engine
   */
  public addObject(obj: Scene | Engine): void {
    obj.features = [];
    for (let i = 0, len = this._features.length; i < len; i++) {
      obj.features.push(new this._features[i]((<any>obj).engine ?? <any>obj) as any);
    }
    this._objects.push(obj);
  }

  /**
   * Call the specified method of the feature.
   * @param obj - Scene or engine
   * @param method - Method name
   * @param args - Function args
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
   * Find feature.
   * @param obj - Scene or engine
   * @param feature - plug-in
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
