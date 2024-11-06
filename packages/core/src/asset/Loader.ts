import { Engine, EngineConfiguration } from "../Engine";
import { AssetPromise } from "./AssetPromise";
import { LoadItem } from "./LoadItem";
import { request, RequestConfig } from "./request";
import { ResourceManager } from "./ResourceManager";
/**
 * Loader abstract class.
 */
export abstract class Loader<T> {
  /**
   * Register a class with a string name for serialization and deserialization.
   * @param key - class name
   * @param obj - class object
   */
  public static registerClass(className: string, classDefine: { new (...args: any): any }) {
    this._engineObjects[className] = classDefine;
    this._classNameMap.set(classDefine, className);
  }

  /**
   * Get the class object by class name.
   * @param key - class name
   * @returns class object
   */
  public static getClass(className: string): { new (...args: any): any } {
    return this._engineObjects[className];
  }

  /**
   * Get the class name by class object.
   * @param obj - class object
   * @returns class name
   */
  public static getClassName(obj: Object): string {
    return this._classNameMap.get(obj);
  }

  private static _engineObjects: { [key: string]: any } = {};
  private static _classNameMap: Map<Object, string> = new Map();

  constructor(public readonly useCache: boolean) {}
  initialize?(engine: Engine, configuration: EngineConfiguration): Promise<void>;
  abstract load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<T>;
  request<U>(url: string, resourceManager: ResourceManager, config: RequestConfig): AssetPromise<U> {
    // @ts-ignore
    const remoteUrl = resourceManager._virtualPathMap[url] ?? url;
    return request(remoteUrl, config);
  }
}
