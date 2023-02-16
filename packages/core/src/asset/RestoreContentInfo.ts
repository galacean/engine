import { EngineObject } from "../base";
import { AssetPromise } from "./AssetPromise";
import { request, RequestConfig } from "./request";

export abstract class RestoreContentInfo {
  constructor(public host: EngineObject) {}
  request: <U>(url: string, config: RequestConfig) => AssetPromise<U> = request;
  abstract restoreContent(): void;
}
