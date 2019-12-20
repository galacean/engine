import { SchemaResource } from "./SchemaResource";
import { ResourceManager } from "../ResourceManager";
import * as o3 from "@alipay/o3";

export class GLTFResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader): Promise<GLTFResource> {
    const assetConfig = this.assetConfig;
    return new Promise((resolve, reject) => {
      const resource = new o3.Resource(assetConfig.name, { type: assetConfig.type as any, url: assetConfig.url });
      resourceLoader.load(resource, (err, res) => {
        if (err) {
          reject(err);
        } else {
          (res.asset as any).newMaterial = (assetConfig.props as any).newMaterial;
          this._resource = res.asset;
          resolve(this);
        }
      });
    });
  }

  bind(resourceManager: ResourceManager) {
    const resource = this._resource;
    this.bindMaterials(resource.newMaterial, resourceManager);
  }

  update(key: string, value: any, resourceManager: ResourceManager) {
    if (key === "newMaterial") {
      this.bindMaterials(value, resourceManager);
    } else {
      this._resource[key] = value;
    }
  }

  private bindMaterials(materials, resourceManager: ResourceManager) {
    if (!materials || !materials.length) {
      return;
    }
    const gltf = this._resource;
    const meshes = gltf.meshes;
    for (let i = 0; i < materials.length; i++) {
      gltf.materials[i] = resourceManager.get(materials[i].id).resource;
    }
    let index = 0;
    for (let i = 0; i < meshes.length; i++) {
      for (let j = 0; j < meshes[i].primitives.length; j++) {
        meshes[i].primitives[j].material = resourceManager.get(materials[index].id).resource;
        index++;
      }
    }
  }
}
