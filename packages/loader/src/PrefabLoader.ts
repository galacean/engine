import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine-core";
import { PrefabParser } from "./prefab/PrefabParser";
import { PrefabResource } from "./prefab/PrefabResource";
import type { PrefabFile } from "./schema/PrefabSchema";

@resourceLoader(AssetType.Prefab, ["prefab"])
export class PrefabLoader extends Loader<PrefabResource> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PrefabResource> {
    const url = item.url!;
    return resourceManager
      ._request<PrefabFile>(url, { ...item, type: "json" })
      .then((data) => PrefabParser.parse(resourceManager.engine, url, data));
  }
}
