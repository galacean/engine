import { ResourceLoader } from "@alipay/o3";
import { ResourceManager } from "../ResourceManager";

export abstract class SchemaResource {
  protected _resource: any;
  get resource() {
    return this._resource;
  }

  constructor(protected assetConfig: AssetConfig) {}

  abstract load(resourceLoader: ResourceLoader): Promise<SchemaResource>;

  bind(resourceManager: ResourceManager): void {}

  update(key: string, value: any, resourceManager: ResourceManager) {
    this._resource[key] = value;
  }
}
