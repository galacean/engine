import { AssetType, Logger, ResourceManager } from "@alipay/o3-core";
import { Oasis } from "../Oasis";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { PBRMaterialResource } from "./PBRMaterialResource";
import { SchemaResource } from "./SchemaResource";

export class GLTFResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<any> {
    return resourceManager
      .load<any>({ url: assetConfig.url, type: AssetType.Perfab })
      .then((res) => {
        const gltf = res;
        if (assetConfig.props) {
          gltf.newMaterial = (assetConfig.props as any).newMaterial;
        }
        this._resource = gltf;
      });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig,
    oasis: Oasis
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve) => {
      this.load(resourceManager, assetConfig, oasis).then(() => {
        const gltf = this.resource;
        const { materials } = gltf;
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
        for (let i = 0; i < materials.length; i++) {
          const material = materials[i];

          const materialResource = new PBRMaterialResource(this.resourceManager);
          this._attachedResources.push(materialResource);
          loadPromises.push(
            materialResource.loadWithAttachedResources(resourceManager, {
              type: "PBRMaterial",
              name: material.name,
              resource: material
            })
          );
        }
        Promise.all(loadPromises).then((res) => {
          const newMaterial = result.structure.props.newMaterial;
          res.forEach((mat) => {
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
        } else {
          Logger.warn(`GLTFResource: ${this.meta.name} can't find asset "material", which id is: ${materials[i].id}`);
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
