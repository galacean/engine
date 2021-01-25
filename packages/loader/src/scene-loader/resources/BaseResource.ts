import { SchemaResource } from "./SchemaResource";
import { AssetConfig } from "../types";

export class BaseResource extends SchemaResource {
  load(resourceLoader, assetConfig: AssetConfig): Promise<BaseResource> {
    return new Promise((resolve) => {
      this._resource = assetConfig;
      this.setMetaData("name", this.resource.name);
      this.setMetaData("url", this.resource.url);
      resolve(this);
    });
  }

  setMetaData(key, value) {
    this._meta[key] = value;
  }
}
