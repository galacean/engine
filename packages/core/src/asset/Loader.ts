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
   * @param engineObject - The engine object
   * @param restoreInfo - The restore info
   */
  addContentRestoreInfo(engineObject: EngineObject, restoreInfo: ContentRestoreInfo): void {
    restoreInfo._loader = this;
    engineObject.engine.resourceManager._addRestoreContentInfo(engineObject.instanceId, restoreInfo);
  }

  /**
   * Called when the content of the host object needs to be restored.
   * @param host - The host object to restore content
   * @param restoreInfo - The restore info
   * @returns The promise of the restore content
   */
  restoreContent(
    host: EngineObject,
    restoreInfo: ContentRestoreInfo
  ): AssetPromise<T> | Record<string, AssetPromise<any>> {
    throw "Restore content not implemented.";
  }
}
