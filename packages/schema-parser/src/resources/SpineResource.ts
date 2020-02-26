import { SchemaResource } from "./SchemaResource";
import { BaseResource } from "./BaseResource";
import { ResourceLoader, AssetManager } from "@alipay/o3";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { spine } from "@alipay/spine-core";

export class SpineResource extends SchemaResource {
  load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<SpineResource> {
    return new Promise((resolve, reject) => {
      const { spineAssets } = assetConfig.props;
      let jsonUrl;
      let atlasUrl;
      let textureUrl;
      if (Array.isArray(spineAssets)) {
        jsonUrl = spineAssets.filter(item => item.meta.assetType === "json")[0].meta.url;
        atlasUrl = spineAssets.filter(item => item.meta.assetType === "atlas")[0].meta.url;
        textureUrl = spineAssets.filter(item => item.meta.assetType !== "json" && item.meta.assetType !== "atlas")[0]
          .meta.url;
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
      const assetManager = new AssetManager();
      assetManager.loadText(jsonUrl);
      assetManager.loadTexture(textureUrl);
      assetManager.loadText(atlasUrl);
      this.loopLoad(resolve, assetManager, {
        jsonUrl,
        atlasUrl,
        textureUrl
      });
    });
  }

  loopLoad(resolve, assetManager, asset) {
    if (assetManager.isLoadingComplete()) {
      const { jsonUrl, atlasUrl, textureUrl } = asset;
      const atlas = new spine.TextureAtlas(assetManager.get(atlasUrl), function(path) {
        return assetManager.get(textureUrl);
      });
      const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
      const skeletonJson = new spine.SkeletonJson(atlasLoader);
      const skeletonData = skeletonJson.readSkeletonData(assetManager.get(jsonUrl));
      this._resource = skeletonData;
      this.setMeta();
      resolve(this);
    } else {
      setTimeout(() => {
        this.loopLoad(resolve, assetManager, asset);
      }, 66);
    }
  }

  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig).then(res => {
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

  bind() {
    const resource = this._resource;
    this.bindMaterials(resource.newMaterial);
  }

  update(key: string, value: any) {
    if (key === "newMaterial") {
      this.bindMaterials(value);
    } else {
      this._resource[key] = value;
    }
  }

  private bindMaterials(materials) {
    if (!materials || !materials.length) {
      return;
    }
    const gltf = this._resource;
    const meshes = gltf.meshes;
    // 兼容material克隆时期生成的schema
    // 通过schema中material数量和gltf中materials数量比较
    // 如果不相等说明是老版本，虽然不准确
    if (materials.length !== gltf.materials.length) {
      for (let i = 0; i < materials.length; i++) {
        const matResource = this.resourceManager.get(materials[i].id);
        if (matResource) {
          gltf.materials[i] = this.resourceManager.get(materials[i].id).resource;
        }
      }
      let index = 0;
      for (let i = 0; i < meshes.length; i++) {
        for (let j = 0; j < meshes[i].primitives.length; j++) {
          const attachedResource = this.resourceManager.get(materials[index].id);
          if (attachedResource) {
            this._attachedResources.push(attachedResource);
            meshes[i].primitives[j].material = attachedResource.resource;
          }
          index++;
        }
      }
    } else {
      for (let i = 0; i < materials.length; i++) {
        const mtlResource = this.resourceManager.get(materials[i].id);
        if (mtlResource) {
          this._attachedResources.push(mtlResource);
          gltf.materials[i] = mtlResource.resource;
        }
      }
      for (let j = 0; j < meshes.length; j++) {
        for (let k = 0; k < meshes[j].primitives.length; k++) {
          if (meshes[j].primitives[k].materialIndex !== undefined) {
            // 因为gltf模型中的materials是倒叙遍历的，所以这里要这么写
            const index = gltf.materials.length - 1 - meshes[j].primitives[k].materialIndex;
            meshes[j].primitives[k].material = gltf.materials[index];
          }
        }
      }
    }
  }
}
