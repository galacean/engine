import {
  AssetType,
  Logger,
  Material,
  MeshRenderer,
  PBRMaterial,
  PBRSpecularMaterial,
  ResourceManager,
  UnlightMaterial
} from "@oasis-engine/core";
import { glTFDracoMeshCompression } from "../../gltf/glTFDracoMeshCompression";
import { Oasis } from "../Oasis";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { BlinnPhongMaterialResource } from "./BlinnPhongMaterialResource";
import { PBRMaterialResource } from "./PBRMaterialResource";
import { PBRSpecularMaterialResource } from "./PBRSpecularMaterialResource";
import { SchemaResource } from "./SchemaResource";
import { UnlightMaterialResource } from "./UnlightMaterialResource";

export class GLTFResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<any> {
    if (!!assetConfig.props?.compression) {
      glTFDracoMeshCompression.init();
    }
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
          let materialResource = null;
          let type = "";

          if (material instanceof PBRMaterial) {
            materialResource = new PBRMaterialResource(this.resourceManager);
            type = "PBRMaterial";
          } else if (material instanceof UnlightMaterial) {
            materialResource = new UnlightMaterialResource(this.resourceManager);
            type = "UnlightMaterial";
          } else if (material instanceof PBRSpecularMaterial) {
            materialResource = new PBRSpecularMaterialResource(this.resourceManager);
            type = "PBRSpecularMaterial";
          } else {
            materialResource = new BlinnPhongMaterialResource(this.resourceManager);
            type = "BlinnPhongMaterial";
          }

          this._attachedResources.push(materialResource);
          loadPromises.push(
            materialResource.loadWithAttachedResources(resourceManager, {
              type,
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
      const node = this.getNodeByMeshIndex(gltf.nodes, meshes.length - 1 - j);
      if (node) {
        for (let k = 0; k < meshes[j].primitives.length; k++) {
          const primitive = meshes[j].primitives[k];
          const meshRenderer = node.getComponent(MeshRenderer);
          const material = gltf.materials[gltf.materials.length - 1 - primitive.materialIndex];
          if (meshRenderer && material && material instanceof Material) {
            meshRenderer.setSharedMaterial(k, material);
          }
        }
      }
    }
  }

  private getNodeByMeshIndex(nodes, index) {
    for (let i = 0; i <= nodes.length; i++) {
      const node = nodes[i];
      if (node.meshIndex === index) {
        return node;
      }
    }
    return null;
  }
}
