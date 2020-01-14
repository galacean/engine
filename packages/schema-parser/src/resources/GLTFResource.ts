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
          if (assetConfig.props) {
            (res.asset as any).newMaterial = (assetConfig.props as any).newMaterial;
          }
          this._resource = res.asset;
          this.setMeta(assetConfig);
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
            this._attachedResources.push(materialResource);
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
            const matResource = mat.resources[matStructure.index];
            result.resources.push(matResource);
            matStructure.index = result.resources.length - 1;
            for (const key in matStructure.props) {
              if (matStructure.props.hasOwnProperty(key)) {
                const textureStructure = matStructure.props[key];
                const textureResource = mat.resources[textureStructure.index];
                result.resources.push(textureResource);
                textureStructure.index = result.resources.length - 1;
              }
            }
            newMaterial.push(matStructure);
          });
          resolve(result);
        });
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
  }
}
