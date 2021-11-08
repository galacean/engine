import { ResourceManager } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";

export class AmbientLightResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<AmbientLightResource> {
    return new Promise((resolve, reject) => {
      const { url } = assetConfig;
      resourceManager
        .load({ url, type: "environment" })
        .then((res) => {
          this._resource = res;
          resolve(this);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
    }
  }
}
