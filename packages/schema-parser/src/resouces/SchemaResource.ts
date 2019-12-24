import { Oasis } from "../Oasis";

import { ResourceLoader } from "@alipay/o3-loader";
import { ResourceManager } from "../ResourceManager";
import { AssetConfig } from "../types";

interface IResourceMeta {
  name?: string;
  url?: string;
  size?: number;
}

function isAsset(config: any): boolean {
  return config.type === "asset";
}

export abstract class SchemaResource {
  protected _meta: IResourceMeta = {};

  get resource() {
    return this._resource;
  }

  get meta() {
    return this._meta;
  }

  protected setMeta() {}

  constructor(protected resourceManager: ResourceManager, protected _resource?: any) {
    this.setMeta();
  }

  abstract load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<SchemaResource>;
  loadWithAttachedResources(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<any> {
    return new Promise(resolve => {
      resolve(this);
    });
  }

  getProps(): any {
    return {};
  }

  bind(): void {}

  update(key: string, value: any) {
    if (isAsset(value)) {
      this._resource[key] = this.resourceManager.get(value.id).resource;
    } else {
      this._resource[key] = value;
    }
  }

  updateMeta(key: string, value: any) {
    this._meta[key] = value;
  }
}
