import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFUtil } from "./gltf/GLTFUtil";
import { ParserContext } from "./gltf/parser/ParserContext";

function subAssetFilter(glTFResource: GLTFResource, query: string) {
  if (!query) {
    return glTFResource;
  }
  const path = GLTFUtil.stringToPath(query);
  const key = path[0];
  const index1 = Number(path[1]) || 0;
  const index2 = Number(path[2]) || 0;

  switch (key) {
    case "textures":
      const texture = glTFResource.textures[index1];
      if (texture) {
        return texture;
      } else {
        throw `texture index not find in: ${index1}`;
      }
    case "materials":
      const material = glTFResource.materials[index1];
      if (material) {
        return material;
      } else {
        throw `material index not find in: ${index1}`;
      }
    case "animations":
      const animationClip = glTFResource.animations[index1];
      if (animationClip) {
        return animationClip;
      } else {
        throw `animation index not find in: ${index1}`;
      }
    case "meshes":
      const mesh = glTFResource.meshes[index1]?.[index2];
      if (mesh) {
        return mesh;
      } else {
        throw `meshIndex-subMeshIndex index not find in: ${index1}-${index2}`;
      }
    case "defaultSceneRoot":
      if (glTFResource.defaultSceneRoot) {
        return glTFResource.defaultSceneRoot;
      } else {
        throw `defaultSceneRoot is not find in this gltf`;
      }
  }
}

@resourceLoader(AssetType.Prefab, ["gltf", "glb"], false, subAssetFilter)
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    return new AssetPromise((resolve, reject, _, onCancel) => {
      const context = new ParserContext();
      context.subAssetFiflter = subAssetFilter;
      context.query = this.query;
      const glTFResource = new GLTFResource(resourceManager.engine);
      context.glTFResource = glTFResource;
      glTFResource.url = url;
      context.keepMeshData = item.params?.keepMeshData ?? false;

      let pipeline = GLTFParser.defaultPipeline;

      onCancel(() => {
        const { chainPromises } = context;
        for (const promise of chainPromises) {
          promise.cancel();
        }
      });

      pipeline
        .parse(context)
        .then(resolve)
        .catch((e) => {
          debugger;
          console.error(e);
          reject(`Error loading glTF model from ${url} .`);
        });
    });
  }
}

/**
 * GlTF loader params.
 */
export interface GLTFParams {
  /** Keep raw mesh data for glTF parser, default is false. */
  keepMeshData: boolean;
}
