import { Logger, ResourceManager } from "@alipay/o3-core";
import { Oasis } from "../Oasis";
import { SchemaResourceManager } from "../ResourceManager";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { isAsset } from "../utils";

interface IResourceMeta {
  name?: string;
  url?: string;
  size?: number;
  source?: string;
}

export abstract class SchemaResource {
  protected _meta: IResourceMeta = {};
  protected _attachedResources: Array<SchemaResource> = [];

  /**
   * 资源
   */
  get resource() {
    return this._resource;
  }

  get meta(): IResourceMeta {
    return this._meta;
  }

  get attachedResources() {
    return this._attachedResources;
  }

  protected setMeta() {}

  constructor(protected resourceManager: SchemaResourceManager, protected _resource?: any) {
    this.setMeta();
  }

  abstract load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<SchemaResource>;
  loadWithAttachedResources(
    resourceLoader: any,
    assetConfig: AssetConfig,
    oasis: Oasis
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      this.load(resourceLoader, assetConfig, oasis)
        .then(() => {
          resolve({
            resources: [this],
            structure: {
              index: 0,
              props: {}
            }
          });
        })
        .catch((e) => {
          reject(e);
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
