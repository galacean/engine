import { ResourceLoader } from "@alipay/o3";
import { ResourceManager } from "../ResourceManager";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

interface IResourceMeta {
  name?: string;
  url?: string;
  size?: number;
  source?: string;
}

function isAsset(config: any): boolean {
  return config.type === "asset";
}

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

  abstract load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<SchemaResource>;
  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig).then(() => {
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
