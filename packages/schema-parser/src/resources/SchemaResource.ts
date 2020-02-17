import { ResourceLoader, Logger } from "@alipay/o3";
import { ResourceManager } from "../ResourceManager";

import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { Oasis } from "../Oasis";

interface IResourceMeta {
  name?: string;
  url?: string;
  size?: number;
  source?: string;
}

function isAsset(config: any): boolean {
  return config && config.type === "asset";
}

Logger.enable();

export abstract class SchemaResource {
  protected _meta: IResourceMeta = {};
  protected _attachedResources: Array<SchemaResource> = [];

  get resource() {
    return this._resource;
  }

  get meta() {
    return this._meta;
  }

  get attachedResources() {
    return this._attachedResources;
  }

  protected setMeta() {}

  constructor(protected resourceManager: ResourceManager, protected _resource?: any) {
    this.setMeta();
  }

  abstract load(resourceLoader: ResourceLoader, assetConfig: AssetConfig, oasis: Oasis): Promise<SchemaResource>;
  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig,
    oasis: Oasis
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig, oasis).then(() => {
        resolve({
          resources: [this],
          structure: {
            index: 0,
            props: {}
          }
        });
      });
    });
  }

  getProps(): any {
    return {};
  }

  bind(): void {}
  attach(): void {}

  update(key: string, value: any) {
    if (isAsset(value)) {
      const resource = this.resourceManager.get(value.id);
      if (resource) {
        this._resource[key] = resource.resource;
      } else {
        Logger.warn(`SchemaResource: ${this.meta.name} can't find asset, which id is: ${value.id}`);
      }
    } else {
      this._resource[key] = value;
    }
  }

  updateMeta(key: string, value: any) {
    this._meta[key] = value;
  }

  onDestroy() {}
}
