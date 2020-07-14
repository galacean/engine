import { LoadItem } from "./LoadItem";
import { AssetPromise } from "./AssetPromise";
import { RequestConfig, request } from "./request";
import { ResourceManager } from "./ResourceManager";

export abstract class Loader<T> {
  request: <U>(url: string, config: RequestConfig) => AssetPromise<U> = request;
  abstract load(item: LoadItem, resouceManager: ResourceManager): AssetPromise<T>;
}
