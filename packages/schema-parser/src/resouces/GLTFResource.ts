import { SchemaResource } from "./SchemaResource";
import { ResourceLoader } from "@alipay/o3";

import * as o3 from "@alipay/o3";
import { PBRMaterialResource } from "./PBRMaterialResource";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

export class GLTFResource extends SchemaResource {
  load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<GLTFResource> {
    return new Promise((resolve, reject) => {
      const resource = new o3.Resource(assetConfig.name, { type: assetConfig.type as any, url: assetConfig.url });
      resourceLoader.load(resource, (err, res) => {
        if (err) {
          reject(err);
        } else {
          (res.asset as any).newMaterial = (assetConfig.props as any).newMaterial;
          (res.asset as any).name = assetConfig.name;
          this._resource = res.asset;
          this.setMeta();
          resolve(this);
        }
      });
    });
  }

  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig).then(() => {
        const gltf = this.resource;
        const meshes = gltf.meshes;
        const loadPromises = [];
        const result = {
          resources: [this],
          structure: {
            index: 0,
            props: {
              newMaterial: []
            }
          }
        };
        for (let i = 0; i < meshes.length; i++) {
          for (let j = 0; j < meshes[i].primitives.length; j++) {
            const material = meshes[i].primitives[j].material;
            if (!material) return;
            const materialResource = new PBRMaterialResource(this.resourceManager);
            loadPromises.push(
              materialResource.loadWithAttachedResources(resourceLoader, {
                type: "PBRMaterial",
                name: material.name,
                props: material
              })
            );
          }
        }
        Promise.all(loadPromises).then(res => {
          const newMaterial = result.structure.props.newMaterial;
          res.forEach(mat => {
            const matStructure = mat.structure;
            result.resources.push(mat.resources[matStructure.index]);
            matStructure.index = result.resources.length - 1;
            for (const key in matStructure.props) {
              if (matStructure.props.hasOwnProperty(key)) {
                const texture = matStructure.props[key];
                result.resources.push(mat.resources[texture.index]);
                texture.index = result.resources.length - 1;
              }
            }
            newMaterial.push(matStructure);
          });
          resolve(result);
        });
      });
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
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
    for (let i = 0; i < materials.length; i++) {
      gltf.materials[i] = this.resourceManager.get(materials[i].id).resource;
    }
    let index = 0;
    for (let i = 0; i < meshes.length; i++) {
      for (let j = 0; j < meshes[i].primitives.length; j++) {
        meshes[i].primitives[j].material = this.resourceManager.get(materials[index].id).resource;
        index++;
      }
    }
  }
}
