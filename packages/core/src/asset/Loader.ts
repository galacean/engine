import { EngineObject } from "../base";
import { AssetPromise } from "./AssetPromise";
import { ContentRestoreInfo } from "./ContentRestoreInfo";
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
  }

  /**
   * Get the class object by class name.
   * @param key - class name
   * @returns class object
   */
  public static getClass(className: string): { new (...args: any): any } {
    return this._engineObjects[className];
  }

  private static _engineObjects: { [key: string]: any } = {};

  constructor(public readonly useCache: boolean) {}

  request: <U>(url: string, config: RequestConfig) => AssetPromise<U> = request;
  abstract load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<T> | Record<string, AssetPromise<any>>;

  /**
   * Add content restore info to the engine object.
   * @param resource - The resource to add restore information
   * @param restoreInfo - The restore info
   */
  addContentRestoreInfo(resource: EngineObject, restoreInfo: ContentRestoreInfo<T>): void {
    restoreInfo._loader = this;
    resource.engine.resourceManager._addRestoreContentInfo(resource, restoreInfo);
  }

  /**
   * Called when the content of the host object needs to be restored.
   * @param resource - The resource to restore content
   * @param restoreInfo - The restore info
   * @returns The promise of the restore content
   */
  restoreContent(resource: EngineObject, restoreInfo: ContentRestoreInfo<T>): AssetPromise<T> {
    throw "Loader: Restore content not implemented.";
  }
}
