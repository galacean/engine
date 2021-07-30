import { LoadItem } from "./LoadItem";
import { AssetPromise } from "./AssetPromise";
import { RequestConfig, request } from "./request";
import { ResourceManager } from "./ResourceManager";
/**
 * Loader abstract class.
 */
export abstract class Loader<T> {
  request: <U>(url: string, config: RequestConfig) => AssetPromise<U> = request;
  abstract load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<T>;
  constructor(public readonly useCache: boolean) {}
}
