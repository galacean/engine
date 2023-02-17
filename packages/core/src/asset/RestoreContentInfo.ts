import { AssetPromise } from "./AssetPromise";
import { request, RequestConfig } from "./request";

export abstract class RestoreContentInfo {
  request: <U>(url: string, config: RequestConfig) => AssetPromise<U> = request;
}
