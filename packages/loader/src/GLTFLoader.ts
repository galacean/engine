import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFUtil } from "./gltf/GLTFUtil";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      const resource = new GLTFResource(resourceManager.engine);
      resource.url = url;
      let pipeline = GLTFParser.texturePipeline;

      const query = GLTFUtil.getQuery(url);
      if (query.q) {
        const path = GLTFUtil.stringToPath(query.q);
        const key = path[0];
        const value1 = Number(path[1]) || 0;
        const value2 = Number(path[2]) || 0;

        switch (key) {
          case "textures":
            pipeline = GLTFParser.texturePipeline;
            resource.textureIndex = value1;
            break;
          case "materials":
            pipeline = GLTFParser.materialPipeline;
            resource.materialIndex = value1;
            break;
          case "animations":
            pipeline = GLTFParser.animationPipeline;
            resource.animationIndex = value1;
            break;
          case "meshes":
            pipeline = GLTFParser.meshPipeline;
            resource.meshIndex = value1;
            resource.subMeshIndex = value2;
            break;
        }
      }

      pipeline
        .parse(resource)
        .then(resolve)
        .catch((e) => {
          console.error(e);
          reject(`Error loading glTF model from ${url} .`);
        });
    });
  }
}
