import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  SpriteAtlas,
  ResourceManager
} from "@oasis-engine/core";
import { AtlasConfig } from "@oasis-engine/core/types/2d/atlas/types";

@resourceLoader(AssetType.SpriteAtlas, ["atlas"], false)
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpriteAtlas> {
    return new AssetPromise((resolve, reject) => {
      this.request<AtlasConfig>(item.url, {
        ...item,
        type: "json"
      })
        .then((atlasData) => {
          const atlasItems = atlasData.AtlasItems;
          const atlasItemsLen = atlasItems.length;
          const picsArr: string[] = new Array(atlasItemsLen);
          // Load the texture used in the atlas.
          for (let idx = atlasItemsLen - 1; idx >= 0; idx--) {
            picsArr[idx] = atlasItems[idx].img;
          }
          Promise.all(
            picsArr.map((url) =>
              this.request<HTMLImageElement>(url, {
                ...item,
                type: "image"
              })
            )
          ).then((imgs) => {
            // Return a SpriteAtlas instance.
            resolve(new SpriteAtlas(resourceManager.engine, atlasData, imgs));
          });
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
