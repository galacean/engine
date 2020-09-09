import { ResourceManager } from "@alipay/o3-core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";
export class VfxResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<VfxResource> {
    return new Promise((resolve, reject) => {
      resolve(this);
    });
  }
  setMeta(assetConfig?: AssetConfig) {
    console.log(`setMeta: ${JSON.stringify(assetConfig)}`);
  }
}
