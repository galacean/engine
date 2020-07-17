import { SchemaResource } from "./SchemaResource";
import { BaseResource } from "./BaseResource";
import { ResourceLoader } from "@alipay/o3";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

export class SpineResource extends SchemaResource {
  load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<SpineResource> {
    return new Promise((resolve, reject) => {
      const { spineAssets } = assetConfig.props;
      let jsonUrl;
      let atlasUrl;
      let textureUrl;
      if (Array.isArray(spineAssets)) {
        for (let i = 0; i < spineAssets.length; i += 1) {
          const asset = spineAssets[i];
          if (asset.meta.assetType === "json") {
            jsonUrl = asset.meta.url;
          } else if (asset.meta.assetType === "atlas") {
            atlasUrl = asset.meta.url;
          } else {
            textureUrl = asset.meta.url;
          }
        }
      } else {
        for (const key in spineAssets) {
          if (spineAssets.hasOwnProperty(key)) {
            const item = spineAssets[key];
            const { type } = item;
            if (type === "json") {
              jsonUrl = item.url;
            } else if (type === "atlas") {
              atlasUrl = item.url;
            } else {
              textureUrl = item.url;
            }
          }
        }
      }
      const assetManager: any = new AssetManager(resourceLoader.rhi);
      assetManager.loadText(jsonUrl);
      assetManager.loadTexture(textureUrl);
      assetManager.loadText(atlasUrl);
      assetManager.onLoad().then(() => {
        const atlas = new spine.TextureAtlas(assetManager.get(atlasUrl), (path) => {
          return assetManager.get(textureUrl);
        });
        const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
        const skeletonJson = new spine.SkeletonJson(atlasLoader);
        const skeletonData = skeletonJson.readSkeletonData(assetManager.get(jsonUrl));
        this._resource = skeletonData;
        this.setMeta();
        resolve(this);
      });
    });
  }

  loadWithAttachedResources(resourceLoader, assetConfig: AssetConfig): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve) => {
      this.load(resourceLoader, assetConfig).then((res) => {
        const result: any = {
          resources: [this],
          structure: {
            index: 0,
            props: {
              spineAssets: []
            }
          }
        };
        const assets = assetConfig.props.spineAssets;
        const spineAssets = result.structure.props.spineAssets;
        for (const key in assets) {
          if (assets.hasOwnProperty(key)) {
            const structure = {
              index: result.resources.length
            };
            const resource = new BaseResource(resourceLoader);
            resource.setMetaData("name", key);
            resource.setMetaData("assetType", key.split(".").pop());
            resource.setMetaData("url", assets[key].url);
            resource.setMetaData("size", assets[key].size);
            result.resources.push(resource);
            this.attachedResources.push(resource);
            spineAssets.push(structure);
          }
        }
        resolve(result);
      });
    });
  }

  setMeta(assetConfig?: AssetConfig) {
    if (assetConfig) {
      this.meta.name = assetConfig.name;
    }
  }
}
