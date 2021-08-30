import { AssetType, ResourceManager, SpriteAtlas } from "@oasis-engine/core";
import { AssetConfig } from "../types";
import { getAllGetters } from "../utils";
import { SchemaResource } from "./SchemaResource";
import { SpriteResource } from "./SpriteResource";

export class SpriteAtlasResource extends SchemaResource {
  static defaultAtlas: SpriteAtlas;

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<SpriteAtlasResource> {
    return new Promise((resolve) => {
      this.setMeta();
      if (assetConfig.source) {
        resourceManager
          .load<SpriteAtlas>({
            url: assetConfig.source,
            type: AssetType.SpriteAtlas
          })
          .then((spriteAtlas) => {
            this._resource = spriteAtlas;
            const { sprites } = spriteAtlas;
            const schemaResourceManager = this.resourceManager;
            for (let index = sprites.length - 1; index >= 0; index--) {
              const sprite = sprites[index];
              const spriteResource = new SpriteResource(schemaResourceManager, sprite);
              // @ts-ignore
              const assetID = sprite._assetID;
              // @ts-ignore
              schemaResourceManager.maxId = Math.max(assetID, schemaResourceManager.maxId);
              // @ts-ignore
              schemaResourceManager.resourceMap[assetID] = spriteResource;
              // @ts-ignore
              schemaResourceManager.resourceIdMap.set(spriteResource, "" + assetID);
            }
            resolve(this);
          });
      } else {
        if (!SpriteAtlasResource.defaultAtlas) {
          SpriteAtlasResource.defaultAtlas = new SpriteAtlas(resourceManager.engine);
        }
        this._resource = SpriteAtlasResource.defaultAtlas;
        resolve(this);
      }
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  getProps() {
    const result = {};
    const props = getAllGetters(this.resource);
    props.forEach((prop) => (result[prop] = this.resource[prop]));
    return result;
  }

  update() {}
}
